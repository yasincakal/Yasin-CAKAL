#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prim raporu — LOGO SP + HTML e-posta (tek dosya).

Zamanlayıcı örneği (cron):
  0 7 * * 1 cd /path && /usr/bin/python3 prim_raporu_mail.py

Ortam değişkenleri (.env veya sistem):
  DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD
  EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_TO (virgülle ayrılmış)
  SMTP_HOST (varsayılan mail.evdema.com), SMTP_PORT (587)
  PRIM_RAPORU_SP (varsayılan YasinprimHesapla)
  PRIM_RAPORU_MAX_KISI (0 = hepsi, e-posta boyutu için sınır)
  PRIM_RAPORU_FILTRE_FIRMA, PRIM_RAPORU_FILTRE_YONETICI, PRIM_RAPORU_FILTRE_ARAMA
"""

from __future__ import annotations

import gzip
import logging
import os
import pickle
import smtplib
import sys
import threading
import time
import calendar
import re
import warnings
from datetime import datetime

import pandas as pd
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from jinja2 import Environment, select_autoescape
from sqlalchemy import create_engine, text

warnings.filterwarnings('ignore', category=FutureWarning)

load_dotenv()

# ---------------------------------------------------------------------------
# Yapılandırma
# ---------------------------------------------------------------------------

SP_NAME = os.environ.get('PRIM_RAPORU_SP', 'YasinprimHesapla')
_CACHE_TTL = int(os.environ.get('PRIM_RAPORU_CACHE_TTL', '14400'))
_CACHE_VERSION = 10
_DATA_DIR = Path(os.environ.get('PRIM_RAPORU_DATA_DIR', Path(__file__).resolve().parent / 'data'))
_CACHE_FILE = _DATA_DIR / 'prim_raporu_cache.pkl.gz'

DB_SERVER = os.getenv('DB_SERVER', r'192.168.0.222\logo')
DB_NAME = os.getenv('DB_NAME', 'LOGO')
DB_USER = os.getenv('DB_USER', 'sa2')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
SMTP_HOST = os.getenv('SMTP_HOST', 'mail.evdema.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
EMAIL_SENDER = os.getenv('EMAIL_SENDER', 'butce@evdema.com')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD', '')
EMAIL_TO = [x.strip() for x in os.getenv('EMAIL_TO', 'yasincakal@evdema.com').split(',') if x.strip()]
MAX_KISI = int(os.environ.get('PRIM_RAPORU_MAX_KISI', '0'))
KISI_BASLI = os.environ.get('PRIM_RAPORU_KISI_BASLI', '1').lower() not in ('0', 'false', 'no')

LOG_FILE = os.environ.get('PRIM_RAPORU_LOG', 'prim_raporu_mail.log')
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

_lock = threading.Lock()
_mem: dict[str, Any] = {'satirlar': None, 'secenekler': None, 'ts': 0.0, 'error': None}

# ---------------------------------------------------------------------------
# Yardımcılar — veri işleme (web modülüyle aynı mantık)
# ---------------------------------------------------------------------------


def _float_val(v) -> float:
    try:
        if v is None:
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _row_key(row: dict, *candidates: str) -> Any:
    for name in candidates:
        if name in row:
            return row[name]
    upper_map = {str(k).upper(): v for k, v in row.items()}
    for name in candidates:
        hit = upper_map.get(name.upper())
        if hit is not None:
            return hit
    return None


def _donem_sirala(donemler: set[str]) -> list[str]:
    aylar = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ]
    ceyrek = ['1. Çeyrek', '2. Çeyrek', '3. Çeyrek', '4. Çeyrek']
    yari = ['1.Yarı', '2.Yarı']

    def key(d: str) -> tuple:
        for i, a in enumerate(aylar):
            if a in d:
                return (0, i, d)
        for i, c in enumerate(ceyrek):
            if c in d:
                return (1, i, d)
        for i, y in enumerate(yari):
            if y in d:
                return (2, i, d)
        return (3, 0, d)

    return sorted(donemler, key=key)


def _yuzde_hesapla(yapilan: float, hedef: float, sp_yuzde: float) -> float:
    if sp_yuzde > 0:
        return round(sp_yuzde, 1)
    if hedef > 0:
        return round(yapilan / hedef * 100, 1)
    return 0.0


def _durum_kod(yuzde: float, hedef: float) -> str:
    if hedef <= 0:
        return 'notr'
    if yuzde >= 100:
        return 'ok'
    if yuzde >= 80:
        return 'yakin'
    return 'kotu'


def _prim_davranis_kod(prim_davranisi: str) -> str:
    v = (prim_davranisi or '').strip().lower()
    if 'hem ayl' in v and ('küm' in v or 'kum' in v):
        return 'hem_ikisi'
    if 'aylık bağımsız' in v or 'aylik bagimsiz' in v:
        return 'aylik'
    return 'kumulatif'


def _prim_davranis_etiket(kod: str, ham: str = '') -> str:
    if kod == 'hem_ikisi':
        return 'Hem Aylık Hem Kümülatif'
    if kod == 'aylik':
        return 'Aylık Bağımsız'
    if ham:
        return ham
    return 'Kümülatif'


def _hedef_1_gecerli_mi(prim_turu: str, prim_davranis_kod: str) -> bool:
    if prim_davranis_kod in ('hem_ikisi', 'aylik'):
        return False
    pt = (prim_turu or '').strip().lower()
    if pt in ('raporlama', 'montaj'):
        return False
    if 'z-bağlantı' in pt or 'z-baglanti' in pt:
        return False
    if 'tahsilat' in pt:
        return False
    return True


def _tahsilat_mi(prim_turu: str, prim_davranis_kod: str = '') -> bool:
    if prim_davranis_kod == 'hem_ikisi':
        return True
    return 'tahsilat' in (prim_turu or '').lower()


def _cari_yil_mi(yil: str) -> bool:
    if not yil:
        return True
    try:
        return int(yil) == datetime.now().year
    except (TypeError, ValueError):
        return True


_AYLAR_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]


def _donem_ay_indeksi(donem: str) -> int | None:
    for i, ay in enumerate(_AYLAR_TR):
        if ay in (donem or ''):
            return i
    return None


def _donem_kisa_adi(donem: str) -> str:
    for ay in _AYLAR_TR:
        if ay in (donem or ''):
            return ay
    return donem or '—'


def _son_aktif_ay(aylar: list[dict], cari_yil: bool = True) -> dict:
    if not aylar:
        return {}
    simdi_ay = datetime.now().month - 1
    adaylar = aylar
    if cari_yil:
        filtre = [
            a for a in aylar
            if _donem_ay_indeksi(a['donem']) is None
            or _donem_ay_indeksi(a['donem']) <= simdi_ay
        ]
        if filtre:
            adaylar = filtre
    for a in reversed(adaylar):
        if (a.get('ciro_ay') or 0) > 0 or (a.get('kar_ay') or 0) > 0:
            return a
        if (a.get('alacagi_prim') or 0) > 0 or (a.get('ciro_prim') or 0) > 0:
            return a
    prev_ciro = prev_kar = None
    son = adaylar[0]
    for a in adaylar:
        c, k = a.get('ciro'), a.get('kar')
        if prev_ciro is None or c != prev_ciro or k != prev_kar:
            son = a
            prev_ciro, prev_kar = c, k
    return son


def _oncelik_1_hedef_mi(oncelik: str) -> bool:
    o = (oncelik or '').strip().lower().replace(' ', '')
    return o == '1.hedef'


def _grup_anahtari(s: dict) -> tuple:
    return (s['firma'], s['satici'], s['kod'], s['bolge'], s['prim_turu'], s['yil'])


def _kumulatif_rakamlar_uygula(satirlar: list[dict]) -> list[dict]:
    if not satirlar:
        return satirlar
    donemler = {s['donem'] for s in satirlar if s['donem'] != '—'}
    donem_sira = {d: i for i, d in enumerate(_donem_sirala(donemler))}
    gruplar: dict[tuple, list[dict]] = {}
    for s in satirlar:
        gruplar.setdefault(_grup_anahtari(s), []).append(s)
    for grup in gruplar.values():
        grup.sort(key=lambda x: donem_sira.get(x['donem'], 999))
        kum_ciro_hedef = kum_ciro = kum_kar_hedef = kum_kar = 0.0
        for s in grup:
            kum_ciro_hedef += s['ciro_hedef']
            kum_ciro += s['ciro']
            kum_kar_hedef += s['kar_hedef']
            kum_kar += s['kar']
            s['ciro_hedef_ay'] = s['ciro_hedef']
            s['ciro_ay'] = s['ciro']
            s['kar_hedef_ay'] = s['kar_hedef']
            s['kar_ay'] = s['kar']
            s['ciro_hedef_kum'] = round(kum_ciro_hedef, 2)
            s['ciro_kum'] = round(kum_ciro, 2)
            s['kar_hedef_kum'] = round(kum_kar_hedef, 2)
            s['kar_kum'] = round(kum_kar, 2)
            pd = s.get('prim_davranis_kod', 'kumulatif')
            if s['ciro_hedef_ay'] > 0 and s.get('ciro_yuzde_ay') is None:
                s['ciro_yuzde_ay'] = round(s['ciro_ay'] / s['ciro_hedef_ay'] * 100, 1)
            if s['kar_hedef_ay'] > 0 and s.get('kar_yuzde_ay') is None:
                s['kar_yuzde_ay'] = round(s['kar_ay'] / s['kar_hedef_ay'] * 100, 1)
            if pd == 'aylik':
                s['ciro_hedef'] = s['ciro_hedef_ay']
                s['ciro'] = s['ciro_ay']
                s['kar_hedef'] = s['kar_hedef_ay']
                s['kar'] = s['kar_ay']
                s['goster_kum'] = False
                s['goster_ay'] = True
            elif pd == 'hem_ikisi':
                s['ciro_hedef'] = s['ciro_hedef_kum']
                s['ciro'] = s['ciro_kum']
                s['kar_hedef'] = s['kar_hedef_kum']
                s['kar'] = s['kar_kum']
                s['goster_kum'] = True
                s['goster_ay'] = True
            else:
                s['ciro_hedef'] = s['ciro_hedef_kum']
                s['ciro'] = s['ciro_kum']
                s['kar_hedef'] = s['kar_hedef_kum']
                s['kar'] = s['kar_kum']
                s['goster_kum'] = True
                s['goster_ay'] = False
            if s['ciro_hedef_kum'] > 0 and s['ciro_yuzde_kum'] <= 0:
                s['ciro_yuzde_kum'] = round(s['ciro_kum'] / s['ciro_hedef_kum'] * 100, 1)
            if s['kar_hedef_kum'] > 0 and s['kar_yuzde_kum'] <= 0:
                s['kar_yuzde_kum'] = round(s['kar_kum'] / s['kar_hedef_kum'] * 100, 1)
            s['tahsilat'] = _tahsilat_mi(s['prim_turu'], pd)
            s['ciro_durum_kod'] = _durum_kod(s['ciro_yuzde_kum'], s['ciro_hedef_kum'])
            s['kar_durum_kod'] = _durum_kod(s['kar_yuzde_kum'], s['kar_hedef_kum'])
            if pd == 'aylik':
                s['ciro_var'] = s['ciro_hedef_ay'] > 0
                s['ciro_durum_kod'] = _durum_kod(s['ciro_yuzde_ay'] or 0, s['ciro_hedef_ay'])
                s['kar_durum_kod'] = _durum_kod(s['kar_yuzde_ay'] or 0, s['kar_hedef_ay'])
            else:
                s['ciro_var'] = s['ciro_hedef_kum'] > 0
            s['kar_var'] = s['kar_hedef_ay'] > 0
            if s.get('birincil_hedef'):
                ho = s.get('hedef_oran_sp') or 0.0
                if ho <= 0:
                    ho = s['kar_yuzde_kum'] if s['kar_var'] else s['ciro_yuzde_kum']
                s['hedef_oran'] = round(ho, 1)
                s['hedef_tuttu'] = ho >= 100
    satirlar.sort(key=lambda x: (
        0 if x.get('birincil_hedef') else (0 if x['tahsilat'] else 1),
        x['firma'].lower(), x['yonetici'].lower(), x['bolge'].lower(),
        x['prim_turu'].lower(), donem_sira.get(x['donem'], 999), x['satici'].lower(),
    ))
    return satirlar


def _satirlari_basitlestir(rows: list[dict]) -> list[dict]:
    sonuc = []
    for r in rows:
        ciro_hedef = _float_val(_row_key(r, 'CiroHedefi'))
        ciro = _float_val(_row_key(r, 'Ciro'))
        kar_hedef = _float_val(_row_key(r, 'KarHedefi'))
        kar = _float_val(_row_key(r, 'Kar'))
        ciro_prim = _float_val(_row_key(r, 'Ciro Prim Hakedişi'))
        kar_prim = _float_val(_row_key(r, 'Kar Prim Hakedişi'))
        ciro_prim_ucreti = _float_val(_row_key(r, 'Ciro Prim Ücreti'))
        kar_prim_ucreti = _float_val(_row_key(r, 'Kar Prim Ücreti'))
        odenen_ciro = _float_val(_row_key(
            r, 'Ödenen Ciro/Tahsilat Primi', 'Ödenen Ciro Primi',
        ))
        odenen_kar = _float_val(_row_key(r, 'Ödenen Kar Primi'))
        prim_turu = str(_row_key(r, 'primaciklama', 'PrimAciklama') or '—').strip() or '—'
        prim_davranisi = str(_row_key(r, 'PrimDavranisi', 'primdavranisi') or '').strip()
        prim_davranis_kod = _prim_davranis_kod(prim_davranisi)
        tahsilat = _tahsilat_mi(prim_turu, prim_davranis_kod)
        hedef_1_gecerli = _hedef_1_gecerli_mi(prim_turu, prim_davranis_kod)
        ciro_kum_sp = _float_val(_row_key(r, 'Ciro Gerçekleşme Kümülatif'))
        ciro_ay_sp = _float_val(_row_key(r, 'Ciro Gerçekleşme Dönemlik'))
        kar_kum_sp = _float_val(_row_key(r, 'Kar Gerçekleşme Kümülatif'))
        kar_ay_sp = _float_val(_row_key(r, 'Kar Gerçekleşme Dönemlik'))
        ciro_yuzde_kum = _yuzde_hesapla(ciro, ciro_hedef, ciro_kum_sp)
        ciro_yuzde_ay = (
            _yuzde_hesapla(ciro, ciro_hedef, ciro_ay_sp)
            if prim_davranis_kod in ('hem_ikisi', 'aylik') else None
        )
        kar_yuzde_kum = _yuzde_hesapla(kar, kar_hedef, kar_kum_sp)
        kar_yuzde_ay = (
            _yuzde_hesapla(kar, kar_hedef, kar_ay_sp)
            if prim_davranis_kod in ('hem_ikisi', 'aylik') else None
        )
        toplam_hakedis = round(ciro_prim + kar_prim, 2)
        toplam_odenen = round(odenen_ciro + odenen_kar, 2)
        prim_ucreti_toplam = round(ciro_prim_ucreti + kar_prim_ucreti, 2)
        oncelik = str(_row_key(r, 'Oncelik') or '').strip()
        birincil_hedef = _oncelik_1_hedef_mi(oncelik)
        sonuc.append({
            'firma': str(_row_key(r, 'Firma') or '—').strip() or '—',
            'yonetici': str(_row_key(r, 'ButceYoneticisi', 'BütçeYöneticisi') or '—').strip() or '—',
            'bolge': str(_row_key(r, 'KarMerkezi', 'Kar Merkezi') or '—').strip() or '—',
            'prim_turu': prim_turu,
            'prim_davranisi': prim_davranisi or _prim_davranis_etiket(prim_davranis_kod),
            'prim_davranis_kod': prim_davranis_kod,
            'hedef_1_gecerli': hedef_1_gecerli,
            'tahsilat': tahsilat,
            'donem': str(_row_key(r, 'Dönem', 'Donem', 'DÖNEM') or '—').strip() or '—',
            'yil': str(_row_key(r, 'YIL', 'Yil') or '').strip(),
            'satici': str(_row_key(r, 'AdiSoyadi', 'Adisoyadi') or '—').strip() or '—',
            'kod': str(_row_key(r, 'SatelemanKodu') or '').strip(),
            'ciro_hedef': ciro_hedef, 'ciro': ciro,
            'ciro_yuzde_kum': ciro_yuzde_kum, 'ciro_yuzde_ay': ciro_yuzde_ay,
            'ciro_durum_kod': _durum_kod(ciro_yuzde_kum, ciro_hedef),
            'kar_hedef': kar_hedef, 'kar': kar,
            'kar_yuzde_kum': kar_yuzde_kum, 'kar_yuzde_ay': kar_yuzde_ay,
            'kar_durum_kod': _durum_kod(kar_yuzde_kum, kar_hedef),
            'ciro_prim': ciro_prim, 'kar_prim': kar_prim,
            'ciro_prim_ucreti': ciro_prim_ucreti, 'kar_prim_ucreti': kar_prim_ucreti,
            'prim_ucreti_toplam': prim_ucreti_toplam,
            'alacagi_prim': toplam_hakedis, 'hakedis': toplam_hakedis,
            'odenen': toplam_odenen,
            'odenen_ciro': odenen_ciro, 'odenen_kar': odenen_kar,
            'kalan': round(toplam_hakedis - toplam_odenen, 2),
            'oncelik': oncelik, 'birincil_hedef': birincil_hedef,
            'hedef_oran_sp': _float_val(_row_key(r, 'HedefOran')),
            'mail': str(_row_key(r, 'mail') or '').strip(),
            'mailcc': str(_row_key(r, 'mailcc') or '').strip(),
            'prim_kategori': str(_row_key(r, 'Primkategori') or '').strip(),
            'bekleyen_siparis': _float_val(_row_key(
                r, 'BekleyenSipariş', 'Bekleyen Sipariş', 'BekleyenSiparis',
            )),
        })
    return _kumulatif_rakamlar_uygula(sonuc)


def filtrele_basit(
    satirlar: list[dict],
    *,
    firma: str = '',
    butce_yoneticisi: str = '',
    kar_merkezi: str = '',
    primaciklama: str = '',
    donem: str = '',
    yil: str = '',
    arama: str = '',
) -> list[dict]:
    if not any((firma, butce_yoneticisi, kar_merkezi, primaciklama, donem, yil, arama)):
        return satirlar
    arama_l = arama.strip().lower()
    out = []
    for s in satirlar:
        if firma and s['firma'] != firma:
            continue
        if butce_yoneticisi and s['yonetici'] != butce_yoneticisi:
            continue
        if kar_merkezi and s['bolge'] != kar_merkezi:
            continue
        if primaciklama and s['prim_turu'] != primaciklama:
            continue
        if donem and s['donem'] != donem:
            continue
        if yil and s['yil'] != yil:
            continue
        if arama_l and arama_l not in s['satici'].lower() and arama_l not in s['kod'].lower():
            continue
        out.append(s)
    return out


def _ay_satir_olustur(s: dict) -> dict:
    return {
        'donem': s['donem'], 'yil': s['yil'], 'tahsilat': s['tahsilat'],
        'goster_kum': s.get('goster_kum', True), 'goster_ay': s.get('goster_ay', False),
        'ciro_hedef': s['ciro_hedef'], 'ciro': s['ciro'],
        'ciro_hedef_ay': s['ciro_hedef_ay'], 'ciro_ay': s['ciro_ay'],
        'ciro_yuzde_kum': s['ciro_yuzde_kum'], 'ciro_yuzde_ay': s['ciro_yuzde_ay'],
        'ciro_durum_kod': s['ciro_durum_kod'],
        'kar_hedef': s['kar_hedef'], 'kar': s['kar'],
        'kar_hedef_ay': s['kar_hedef_ay'], 'kar_ay': s['kar_ay'],
        'kar_yuzde_kum': s['kar_yuzde_kum'], 'kar_yuzde_ay': s['kar_yuzde_ay'],
        'kar_durum_kod': s['kar_durum_kod'],
        'ciro_prim': s['ciro_prim'], 'kar_prim': s['kar_prim'],
        'prim_ucreti_toplam': s.get('prim_ucreti_toplam', 0),
        'alacagi_prim': s['alacagi_prim'], 'hakedis': s.get('hakedis', s['alacagi_prim']),
        'ciro_var': s['ciro_var'], 'kar_var': s['kar_var'],
        'odenen': s['odenen'], 'kalan': s['kalan'],
        'hedef_oran': s.get('hedef_oran'), 'hedef_tuttu': s.get('hedef_tuttu'),
    }


def _prim_turu_kart_olustur(satirlar: list[dict], donem_sira: dict[str, int]) -> dict:
    ilk = satirlar[0]
    pd = ilk['prim_davranis_kod']
    aylar = [_ay_satir_olustur(s) for s in satirlar]
    aylar.sort(key=lambda a: donem_sira.get(a['donem'], 999))
    yil = ilk.get('yil') or (aylar[-1]['yil'] if aylar else '')
    return {
        'firma': ilk['firma'], 'satici': ilk['satici'], 'kod': ilk['kod'], 'bolge': ilk['bolge'],
        'prim_turu': ilk['prim_turu'], 'prim_davranisi': ilk['prim_davranisi'],
        'prim_davranis_kod': pd,
        'goster_kum': ilk.get('goster_kum', pd != 'aylik'),
        'goster_ay': ilk.get('goster_ay', pd in ('aylik', 'hem_ikisi')),
        'hedef_1_gecerli': ilk['hedef_1_gecerli'], 'cari_yil': _cari_yil_mi(yil), 'yil': yil,
        'birincil_hedef': ilk.get('birincil_hedef', False), 'aylar': aylar,
        'toplam_prim_ucreti': round(sum(a.get('prim_ucreti_toplam', 0) for a in aylar), 2),
        'toplam_hakedis': round(sum(a.get('hakedis', a['alacagi_prim']) for a in aylar), 2),
        'toplam_odenen': round(sum(a['odenen'] for a in aylar), 2),
        'toplam_kalan': round(sum(a['kalan'] for a in aylar), 2),
        'toplam_prim': round(sum(a.get('hakedis', a['alacagi_prim']) for a in aylar), 2),
        'toplam_ciro_prim': round(sum(a['ciro_prim'] for a in aylar), 2),
        'toplam_kar_prim': round(sum(a['kar_prim'] for a in aylar), 2),
        'ay_sayisi': len(aylar), 'tahsilat': ilk['tahsilat'],
        'ciro_var': any(a['ciro_var'] for a in aylar),
        'kar_var': any(a['kar_var'] for a in aylar),
    }


def _kisi_1hedef_aciklamasi(kart: dict, bagli_primler: list[str]) -> dict:
    aylar = kart.get('aylar') or []
    if not aylar:
        return {}
    cari = kart.get('cari_yil', True)
    son = _son_aktif_ay(aylar, cari_yil=cari)
    kar_olcum = kart['kar_var']
    oran = son.get('hedef_oran')
    if oran is None:
        oran = son['kar_yuzde_kum'] if kar_olcum else son['ciro_yuzde_kum']
    oran = round(float(oran or 0), 1)
    tuttu = oran >= 100
    prim_turu = kart['prim_turu']
    donem = son['donem']
    ay_adi = _donem_kisa_adi(donem)
    if kar_olcum:
        olcum_metin = 'kar performansına'
        hedef_tl = son['kar_hedef']
        yapti_tl = son['kar']
    else:
        olcum_metin = 'ciro (satış) performansına'
        hedef_tl = son['ciro_hedef']
        yapti_tl = son['ciro']
    bagli_txt = ', '.join(bagli_primler) if bagli_primler else ''
    if tuttu:
        sonuc = (
            f'{ay_adi} sonu itibarıyla kümülatif hedef tuttu (%{oran:.0f}). '
            f'Bu ay priminiz ödenir.'
        )
        if bagli_txt:
            sonuc += f" 1.Hedef'e tabi primleriniz ({bagli_txt}) için de kendi hedefiniz tutmalı."
    else:
        eksik = max(0.0, round(100 - oran, 1))
        sonuc = (
            f'Şu an <strong>{ay_adi}</strong> sonu kümülatif <strong>%{oran:.0f}</strong> '
            f'(hedefe %{eksik:.0f} eksik). '
            f'<strong>{ay_adi} ayı sonunda kümülatif %100\'e ulaşırsanız</strong> o ayın primini alırsınız; '
            f'Ocak–{ay_adi} arasında hak edip alamadığınız tutarlar da <strong>geriye dönük ödenir</strong>.'
        )
    if cari:
        yil_notu = (
            'Primler <strong>her ay ayrı ödenir</strong>. Her ayın hesabında yalnızca '
            f'<strong>Ocak–{ay_adi}</strong> kümülatif oranına bakılır; '
            'Temmuz–Aralık hedefleri şimdiki %\'nizi düşürmez.'
        )
    else:
        yil_notu = 'Geçmiş yıl kaydı — yıl sonu barem çarpanı uygulanmış olabilir.'
    return {
        'donem': donem, 'ay_adi': ay_adi, 'oran': oran, 'tuttu': tuttu, 'cari_yil': cari,
        'olcum': 'kar' if kar_olcum else 'ciro', 'prim_turu': prim_turu,
        'hedef_tl': hedef_tl, 'yapti_tl': yapti_tl,
        'baslik': f'Şu an ({ay_adi}) — 1.Hedef küm. %{oran:.0f}',
        'satir1': (
            f'<strong>Oncelik = 1.Hedef</strong> satırınız (<em>{prim_turu}</em>) '
            f'birincil hedefinizdir.'
        ),
        'satir2': (
            f'<strong>{olcum_metin}</strong> göre, <strong>{ay_adi} sonu</strong> kümülatif '
            f'hedef/yaptı aşağıdaki tabloda görünür.'
        ),
        'yil_notu': yil_notu,
        'istisna': (
            'Tahsilat, Z-Bağlantı, raporlama/montaj, <em>Aylık Bağımsız</em> primler '
            '1.Hedef şartına <strong>tabi değildir</strong> — onlar kendi kurallarıyla aylık ödenir.'
        ),
        'sonuc': sonuc,
    }


def _kisi_prim_aciklamasi(kart: dict, hedef_1_aciklama: dict | None) -> dict:
    pd = kart['prim_davranis_kod']
    aylar = kart.get('aylar') or []
    cari = kart.get('cari_yil', True)
    aktif = _son_aktif_ay(aylar, cari_yil=cari) if aylar else {}
    ay_adi = _donem_kisa_adi(aktif.get('donem', ''))
    davranis_map = {
        'kumulatif': (
            f'<strong>Kümülatif prim — aylık ödenir:</strong> Her ay ayrı hesaplanır ve ödenir. '
            f'O ayın <strong>kümülatif</strong> (Ocak–{ay_adi or "o ay"}) oranı %100\'e ulaşırsa '
            f'hem o ayın primi hem önceki aylarda kaçırdıklarınız ödenir.'
        ),
        'aylik': (
            '<strong>Aylık bağımsız — aylık ödenir:</strong> Sadece o ayın hedefi/yaptısına bakılır. '
            '1.Hedef şartı yoktur.'
        ),
        'hem_ikisi': (
            f'<strong>Tahsilat — aylık ödenir:</strong> Her ay hem <strong>o ayın</strong> hem '
            f'<strong>kümülatif</strong> tahsilat performansına bakılır. 1.Hedef geçerli değildir.'
        ),
    }
    davranis = davranis_map.get(pd, davranis_map['kumulatif'])
    if not kart['hedef_1_gecerli']:
        hedef_notu = 'Bu prim <strong>1.Hedef şartına tabi değildir</strong> — kendi kuralıyla aylık ödenir.'
    elif hedef_1_aciklama and hedef_1_aciklama.get('tuttu'):
        hedef_notu = (
            f'1.Hedef şu an tutuyor (%{hedef_1_aciklama.get("oran", 0):.0f}). '
            f'Bu satırda da {ay_adi or "ilgili ay"} sonu kümülatif %100 olmalı.'
        )
    elif hedef_1_aciklama:
        hedef_notu = (
            f'1.Hedef şu an %{hedef_1_aciklama.get("oran", 0):.0f} '
            f'({hedef_1_aciklama.get("ay_adi", "")} sonu kümülatif). '
            f'{ay_adi or "Bu ay"} sonunda %100\'e çıkarsanız bu prim de ödenir (geçmiş aylar dahil).'
        )
    else:
        hedef_notu = "Bu prim 1.Hedef'e tabidir."
    if cari:
        odeme_notu = f'Ödeme dönemi: aylık. Şu anki değerlendirme ayı: {ay_adi or "—"}.'
    else:
        odeme_notu = 'Geçmiş yıl — yıl sonu barem uygulanmış olabilir.'
    return {
        'prim_davranisi': kart['prim_davranisi'], 'davranis': davranis,
        'hedef_notu': hedef_notu, 'odeme_notu': odeme_notu,
    }


def grupla_kisi_kartlari(satirlar: list[dict]) -> list[dict]:
    if not satirlar:
        return []
    donemler = {s['donem'] for s in satirlar if s['donem'] != '—'}
    donem_sira = {d: i for i, d in enumerate(_donem_sirala(donemler))}
    kisi_satirlar: dict[tuple, list[dict]] = {}
    kisi_sira: list[tuple] = []
    for s in satirlar:
        pk = (s['firma'], s['satici'], s['kod'], s['bolge'])
        if pk not in kisi_satirlar:
            kisi_satirlar[pk] = []
            kisi_sira.append(pk)
        kisi_satirlar[pk].append(s)
    kartlar = []
    for pk in kisi_sira:
        rows = kisi_satirlar[pk]
        ilk = rows[0]
        hedef_rows = [s for s in rows if s.get('birincil_hedef')]
        diger_rows = [s for s in rows if not s.get('birincil_hedef')]
        hedef_1 = None
        if hedef_rows:
            h_gruplar: dict[str, list[dict]] = {}
            for s in hedef_rows:
                h_gruplar.setdefault(s['prim_turu'], []).append(s)
            h_prim = sorted(h_gruplar.keys(), key=str.lower)[0]
            hedef_1 = _prim_turu_kart_olustur(h_gruplar[h_prim], donem_sira)
        prim_gruplar: dict[str, list[dict]] = {}
        prim_sira: list[str] = []
        for s in diger_rows:
            if s['prim_turu'] not in prim_gruplar:
                prim_gruplar[s['prim_turu']] = []
                prim_sira.append(s['prim_turu'])
            prim_gruplar[s['prim_turu']].append(s)
        primler = [_prim_turu_kart_olustur(prim_gruplar[p], donem_sira) for p in prim_sira]
        primler.sort(key=lambda k: (0 if k['tahsilat'] else 1, k['prim_turu'].lower()))
        bagli_primler = [p['prim_turu'] for p in primler if p['hedef_1_gecerli']]
        h_aciklama = None
        if hedef_1:
            hedef_1['aciklama'] = _kisi_1hedef_aciklamasi(hedef_1, bagli_primler)
            h_aciklama = hedef_1['aciklama']
        for prim in primler:
            prim['aciklama'] = _kisi_prim_aciklamasi(prim, h_aciklama)
        toplam_prim = round(
            (hedef_1['toplam_prim'] if hedef_1 else 0) + sum(p['toplam_prim'] for p in primler), 2,
        )
        kartlar.append({
            'firma': ilk['firma'], 'satici': ilk['satici'], 'kod': ilk['kod'],
            'bolge': ilk['bolge'], 'yonetici': ilk['yonetici'],
            'hedef_1': hedef_1,
            'hedef_1_tuttu': (
                hedef_1['aciklama'].get('tuttu')
                if hedef_1 and hedef_1.get('aciklama') else None
            ),
            'primler': primler, 'toplam_prim': toplam_prim,
            'prim_sayisi': (1 if hedef_1 else 0) + len(primler),
        })
    kartlar.sort(key=lambda k: (
        0 if k['hedef_1'] and k['hedef_1_tuttu'] is False else 1,
        k['satici'].lower(), k['firma'].lower(),
    ))
    return kartlar


def basit_ozet(satirlar: list[dict]) -> dict:
    if not satirlar:
        return {
            'kisi': 0, 'toplam_ciro': 0, 'toplam_kar': 0,
            'toplam_prim': 0, 'toplam_odenen': 0,
            'ciro_hedef_tutan': 0, 'kar_hedef_tutan': 0,
        }
    saticilar = {s['satici'] for s in satirlar}
    return {
        'kisi': len(saticilar),
        'toplam_ciro': round(sum(s['ciro_ay'] for s in satirlar), 2),
        'toplam_kar': round(sum(s['kar_ay'] for s in satirlar), 2),
        'toplam_prim': round(sum(s['alacagi_prim'] for s in satirlar), 2),
        'toplam_odenen': round(sum(s['odenen'] for s in satirlar), 2),
        'ciro_hedef_tutan': sum(1 for s in satirlar if s['ciro_var'] and s['ciro_durum_kod'] == 'ok'),
        'kar_hedef_tutan': sum(1 for s in satirlar if s['kar_var'] and s['kar_durum_kod'] == 'ok'),
    }


# ---------------------------------------------------------------------------
# Dashboard (eski e-posta kodu — kişi bazlı)
# ---------------------------------------------------------------------------

COLOR_PALETTE = {
    'primary': '#4f46e5', 'success': '#16a34a', 'warning': '#d97706', 'danger': '#dc2626',
    'gray': '#6b7280', 'light': '#f3f4f6', 'dark': '#1f2937', 'border': '#e2e8f0',
    'ciro': '#3b82f6', 'kar': '#8b5cf6', 'tahsilat': '#22c55e',
    'header-bg': '#f8fafc', 'header-text': '#374151', 'accent': '#a855f7', 'info': '#0ea5e9',
    'gradient-primary': 'linear-gradient(135deg, #4f46e5 0%, #a855f7 100%)',
}

MONTH_NAMES = {
    '01-Ocak': 1, '02-Şubat': 2, '03-Mart': 3, '04-Nisan': 4, '05-Mayıs': 5, '06-Haziran': 6,
    '07-Temmuz': 7, '08-Ağustos': 8, '09-Eylül': 9, '10-Ekim': 10, '11-Kasım': 11, '12-Aralık': 12,
}
ALL_QUARTERS = [f'{q}. Çeyrek' for q in range(1, 5)]
ALL_MONTHS = list(MONTH_NAMES.keys())
PERIOD_ORDER = ALL_QUARTERS + ALL_MONTHS


def _fmt_tl(number, decimals: int = 2, currency: str = '₺') -> str:
    try:
        v = float(number or 0)
        formatted = f'{abs(v):,.{decimals}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        if v < 0:
            formatted = f'-{formatted}'
        return f'{formatted} {currency}'
    except (TypeError, ValueError):
        return f'0,00 {currency}'


def _to_num(series) -> pd.Series:
    if series is None:
        return pd.Series(dtype=float)
    s = series.astype(str).str.replace(r'[₺\s]', '', regex=True).str.replace('.', '', regex=False)
    s = s.str.replace(',', '.', regex=False)
    return pd.to_numeric(s, errors='coerce').fillna(0.0)


def _satirlar_to_df(satirlar: list[dict]) -> pd.DataFrame:
    rows = []
    for s in satirlar:
        rows.append({
            'AdiSoyadi': s['satici'], 'KarMerkezi': s['bolge'], 'primaciklama': s['prim_turu'],
            'Dönem': s['donem'], 'CiroHedefi': s['ciro_hedef'], 'Ciro': s['ciro'],
            'KarHedefi': s['kar_hedef'], 'Kar': s['kar'],
            'Ciro Prim Ücreti': s.get('ciro_prim_ucreti', 0),
            'Kar Prim Ücreti': s.get('kar_prim_ucreti', 0),
            'Ciro Prim Hakedişi': s.get('ciro_prim', 0),
            'Kar Prim Hakedişi': s.get('kar_prim', 0),
            'Ödenen Kar Primi': s.get('odenen_kar', 0),
            'Ödenen Ciro/Tahsilat Primi': s.get('odenen_ciro', 0),
            'Oncelik': s.get('oncelik', ''), 'Primkategori': s.get('prim_kategori', ''),
            'mail': s.get('mail', ''), 'mailcc': s.get('mailcc', ''),
            'ButceYoneticisi': s.get('yonetici', ''),
            'BekleyenSipariş': s.get('bekleyen_siparis', 0),
        })
    df = pd.DataFrame(rows)
    if not df.empty and 'Dönem' in df.columns:
        df['Dönem'] = pd.Categorical(df['Dönem'], categories=PERIOD_ORDER, ordered=True)
        df = df.sort_values('Dönem')
    return df


def _get_target_status(target: float, actual: float) -> dict:
    if target == 0:
        return {'percentage': 0, 'gap': 0, 'status': 'neutral', 'color': COLOR_PALETTE['gray']}
    percentage = actual / target * 100
    gap = target - actual
    if percentage >= 100:
        return {'percentage': 100, 'gap': 0, 'status': 'success', 'color': COLOR_PALETTE['success']}
    if percentage >= 80:
        return {'percentage': percentage, 'gap': gap, 'status': 'warning', 'color': COLOR_PALETTE['warning']}
    return {'percentage': percentage, 'gap': gap, 'status': 'danger', 'color': COLOR_PALETTE['danger']}


def _battery_icon(real_percentage: float) -> str:
    pct = round(max(0, min(100, real_percentage)))
    fill = '#10b981' if pct >= 90 else '#f59e0b' if pct >= 65 else '#ef4444'
    return f"""
    <div style="width:100%;font-family:Arial,sans-serif;">
      <div style="text-align:center;margin-bottom:6px;">
        <span style="font-size:28px;font-weight:800;color:{fill};">{pct}%</span>
      </div>
      <div style="border:2px solid {fill};border-radius:22px;padding:2px;background:#fff;">
        <div style="height:40px;background:#f3f4f6;border-radius:20px;overflow:hidden;">
          <div style="height:100%;width:{pct}%;background:{fill};border-radius:20px;"></div>
        </div>
      </div>
    </div>"""


def _period_info(df_period: pd.DataFrame, current_year: int) -> tuple[str, str]:
    if df_period is None or df_period.empty:
        return '—', '(—)'
    periods = [p for p in df_period['Dönem'].dropna().unique()]
    month_list = [str(p).split('-')[1] for p in periods if '-' in str(p)]
    quarter_list = [p for p in periods if p in ALL_QUARTERS]
    if quarter_list:
        label = ' – '.join(sorted(quarter_list, key=lambda x: int(str(x).split('.')[0])))
        sub = 'Çeyrek dönemi toplam verileri'
    elif month_list:
        label = month_list[0] if len(month_list) == 1 else f'{month_list[0]} – {month_list[-1]}'
        sub = f'{label} dönemi toplam verileri'
    else:
        label, sub = '—', '—'
    return f'{label} {current_year}', f'({sub})'


def _target_progress_card(
    target: float, actual: float, title_key: str, period_label: str, period_detail: str,
    yearly_target: float, yearly_actual: float, col_type: str, remaining_period: int,
    remaining_year: int, bekleyen: float = 0,
) -> str:
    real_pct = (actual / target * 100) if target > 0 else 0
    yearly_pct = (yearly_actual / yearly_target * 100) if yearly_target > 0 else 0
    gap = target - actual
    yearly_gap = yearly_target - yearly_actual
    if col_type == 'ciro':
        base, grad = '#3b82f6', COLOR_PALETTE['gradient-primary']
    elif col_type == 'kar':
        base, grad = '#8b5cf6', 'linear-gradient(135deg, #16a34a 0%, #86efac 100%)'
    else:
        base, grad = '#10b981', 'linear-gradient(135deg, #f59e0b 0%, #facc15 100%)'

    def _gap_text(g: float, pct: float) -> tuple[str, str]:
        if pct >= 100:
            return ('🎉 Hedef Aşıldı!' if pct > 100 else '🎉 Hedef Ulaşıldı!'), COLOR_PALETTE['success']
        if g > 0:
            return f'{_fmt_tl(g, 0)} Açık', COLOR_PALETTE['danger']
        return f'{_fmt_tl(abs(g), 0)} Fazla', COLOR_PALETTE['success']

    gap_text, gap_color = _gap_text(gap, real_pct)
    y_gap_text, y_gap_color = _gap_text(yearly_gap, yearly_pct)
    bekleyen_html = (
        f'<div style="font-size:13px;color:{base};font-weight:600;margin:8px 0;">'
        f'Bekleyen Sipariş: {_fmt_tl(bekleyen, 0)}</div>'
        if col_type == 'ciro' else ''
    )
    return f"""
    <div style="border:2px solid {base};border-radius:12px;padding:12px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.08);">
      <div style="text-align:center;background:{base};color:#fff;padding:8px;border-radius:6px;margin-bottom:10px;">
        <span style="font-size:22px;font-weight:900;">{title_key}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:240px;background:#f8fafc;border-radius:8px;padding:12px;">
          <div style="background:{base};color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;margin-bottom:8px;">
            Dönem: {period_label} {period_detail}
          </div>
          <div style="font-size:13px;margin-bottom:4px;"><strong>Dönem Hedefi:</strong> {_fmt_tl(target, 0)}</div>
          <div style="font-size:13px;margin-bottom:4px;"><strong>Gerçekleşen:</strong> {_fmt_tl(actual, 0)}</div>
          <div style="font-size:13px;color:{gap_color};font-weight:700;">Açık/Fazla: {gap_text}</div>
          {bekleyen_html}
          <div style="margin:10px 0;">{_battery_icon(real_pct)}</div>
          <div style="font-size:12px;">⏰ Kalan gün: <strong>{remaining_period}</strong></div>
        </div>
        <div style="flex:1;min-width:240px;background:#f8fafc;border-radius:8px;padding:12px;">
          <div style="background:{base};color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;margin-bottom:8px;">
            {datetime.now().year} Yıllık Hedef
          </div>
          <div style="font-size:13px;margin-bottom:4px;"><strong>Yıllık Hedef:</strong> {_fmt_tl(yearly_target, 0)}</div>
          <div style="font-size:13px;margin-bottom:4px;"><strong>Yıllık Gerçekleşen:</strong> {_fmt_tl(yearly_actual, 0)}</div>
          <div style="font-size:13px;color:{y_gap_color};font-weight:700;">Açık/Fazla: {y_gap_text}</div>
          <div style="margin:10px 0;">{_battery_icon(yearly_pct) if yearly_target > 0 else ''}</div>
          <div style="font-size:12px;">⏰ Kalan gün: <strong>{remaining_year}</strong></div>
        </div>
      </div>
    </div>"""


def _league_tables_all(df: pd.DataFrame) -> dict[str, str]:
    filtered = df[df['Oncelik'] == '1.Hedef'].copy()
    if filtered.empty:
        return {}
    for col in ('Ciro', 'CiroHedefi', 'BekleyenSipariş'):
        if col in filtered.columns:
            filtered[col] = _to_num(filtered[col])
    league = filtered.groupby(['Primkategori', 'AdiSoyadi', 'KarMerkezi'], as_index=False).agg({
        'Ciro': 'sum', 'CiroHedefi': 'sum', 'BekleyenSipariş': 'sum',
    })
    league['Performans'] = (league['Ciro'] / league['CiroHedefi'].replace(0, 1) * 100).round(0)
    out: dict[str, str] = {}
    for cat in league['Primkategori'].dropna().unique():
        cat_df = league[league['Primkategori'] == cat].sort_values('Ciro', ascending=False).reset_index(drop=True)
        if cat_df.empty:
            continue
        rows_html = ''
        for i, row in cat_df.iterrows():
            rank = '🥇' if i == 0 else '🥈' if i == 1 else '🥉' if i == 2 else f'#{i + 1}'
            perf = float(row['Performans'] or 0)
            perf_color = COLOR_PALETTE['success'] if perf >= 100 else COLOR_PALETTE['warning'] if perf >= 80 else COLOR_PALETTE['danger']
            rows_html += (
                f'<tr><td>{rank}</td><td>{cat}</td><td>{row["AdiSoyadi"]}</td>'
                f'<td style="text-align:right">{_fmt_tl(row["Ciro"], 0)}</td>'
                f'<td style="text-align:right">{_fmt_tl(row["BekleyenSipariş"], 0)}</td>'
                f'<td style="text-align:right;color:{perf_color};font-weight:700;">{perf:.0f}%</td></tr>'
            )
        out[str(cat)] = (
            '<table class="dash-tbl" width="100%"><thead><tr>'
            '<th>#</th><th>Kategori</th><th>Kişi</th><th>Gerçek</th><th>Bekleyen</th><th>%</th>'
            f'</tr></thead><tbody>{rows_html}</tbody></table>'
        )
    return out


def _dashboard_hedef_html(km_df: pd.DataFrame) -> str:
    now = datetime.now()
    cy, cm = now.year, now.month
    cq = (cm - 1) // 3 + 1
    ytd_q = [f'{q}. Çeyrek' for q in range(1, cq + 1)]
    ytd_m = [m for m, n in MONTH_NAMES.items() if n <= cm]
    ytd = km_df[km_df['Dönem'].isin(ytd_q + ytd_m)].copy()

    personal_ytd = ytd[(ytd['primaciklama'] == 'Kişisel Bütçe') | (ytd['Oncelik'] == '1.Hedef')]
    personal_all = km_df[(km_df['primaciklama'] == 'Kişisel Bütçe') | (km_df['Oncelik'] == '1.Hedef')]

    ciro_h_ytd = _to_num(personal_ytd['CiroHedefi']).sum()
    ciro_ytd = _to_num(personal_ytd['Ciro']).sum()
    kar_h_ytd = _to_num(personal_ytd['KarHedefi']).sum()
    kar_ytd = _to_num(personal_ytd['Kar']).sum()
    ciro_h_year = _to_num(personal_all['CiroHedefi']).sum()
    ciro_year = _to_num(personal_all['Ciro']).sum()
    kar_h_year = _to_num(personal_all['KarHedefi']).sum()
    kar_year = _to_num(personal_all['Kar']).sum()

    tah_ytd_rows = ytd[ytd['primaciklama'].isin(['Z-Tahsilat Bütçesi', 'Z-Bağlantı Tahsilatı'])]
    tah_h_ytd = _to_num(tah_ytd_rows['CiroHedefi']).sum()
    tah_ytd_val = _to_num(tah_ytd_rows['Ciro']).sum()
    tah_all = km_df[km_df['primaciklama'].isin(['Z-Tahsilat Bütçesi', 'Z-Bağlantı Tahsilatı'])]
    tah_h_year = _to_num(tah_all['CiroHedefi']).sum()
    tah_year = _to_num(tah_all['Ciro']).sum()
    tah_baslik = 'Bağlantı Hedefi' if 'Z-Bağlantı Tahsilatı' in tah_ytd_rows['primaciklama'].values else 'Tahsilat'

    bekleyen = 0.0
    bdf = ytd[ytd['Oncelik'] == '1.Hedef']
    if not bdf.empty and 'BekleyenSipariş' in bdf.columns:
        bekleyen = _to_num(bdf['BekleyenSipariş']).sum()

    rem_year = max(0, (datetime(cy, 12, 31) - now).days)
    last_m = cm
    rem_period = max(0, (datetime(cy, last_m, calendar.monthrange(cy, last_m)[1]) - now).days)
    pinfo = _period_info(personal_ytd, cy)

    cards = []
    if ciro_h_ytd > 0 or ciro_ytd > 0:
        cards.append(_target_progress_card(
            ciro_h_ytd, ciro_ytd, 'Ciro', pinfo[0], pinfo[1],
            ciro_h_year, ciro_year, 'ciro', rem_period, rem_year, bekleyen,
        ))
    if kar_h_ytd > 0 or kar_ytd > 0:
        cards.append(_target_progress_card(
            kar_h_ytd, kar_ytd, 'Kar', pinfo[0], pinfo[1],
            kar_h_year, kar_year, 'kar', rem_period, rem_year,
        ))
    if tah_h_ytd > 0 or tah_ytd_val > 0:
        cards.append(_target_progress_card(
            tah_h_ytd, tah_ytd_val, tah_baslik, _period_info(tah_ytd_rows, cy)[0],
            _period_info(tah_ytd_rows, cy)[1], tah_h_year, tah_year, 'tahsilat', rem_period, rem_year,
        ))
    if not cards:
        return ''
    return (
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));'
        f'gap:16px;margin-bottom:20px;">{"".join(cards)}</div>'
    )


def _league_html_for_person(km_df: pd.DataFrame, league_all: dict[str, str]) -> str:
    cats = km_df[km_df['Oncelik'] == '1.Hedef']['Primkategori'].dropna().unique().tolist()[:3]
    cq = (datetime.now().month - 1) // 3 + 1
    parts = []
    for cat in cats:
        tbl = league_all.get(str(cat), '')
        if not tbl:
            continue
        parts.append(
            f'<div style="background:#fff;border:1px solid {COLOR_PALETTE["border"]};border-radius:16px;'
            f'overflow:hidden;margin-bottom:16px;box-shadow:0 4px 16px rgba(0,0,0,.08);">'
            f'<div style="background:{COLOR_PALETTE["gradient-primary"]};color:#fff;padding:16px 20px;'
            f'font-weight:800;">🏆 {cat} <span style="opacity:.85;font-size:13px;">Q{cq} {datetime.now().year}</span></div>'
            f'<div style="padding:12px;overflow-x:auto;">{tbl}</div></div>'
        )
    return ''.join(parts) if parts else ''


# ---------------------------------------------------------------------------
# Önbellek + veritabanı
# ---------------------------------------------------------------------------


def _disk_oku() -> dict | None:
    if not _CACHE_FILE.exists():
        return None
    try:
        with gzip.open(_CACHE_FILE, 'rb') as f:
            data = pickle.load(f)
        if data.get('sp_name') != SP_NAME:
            return None
        if data.get('cache_version') != _CACHE_VERSION:
            return None
        if time.time() - float(data.get('ts', 0)) > _CACHE_TTL:
            return None
        return data
    except Exception:
        return None


def _disk_yaz(satirlar: list[dict], secenekler: dict) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        'ts': time.time(), 'sp_name': SP_NAME, 'cache_version': _CACHE_VERSION,
        'satirlar': satirlar, 'secenekler': secenekler,
    }
    tmp = _CACHE_FILE.with_suffix('.tmp')
    with gzip.open(tmp, 'wb') as f:
        pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
    tmp.replace(_CACHE_FILE)


def _mem_yukle(data: dict) -> None:
    _mem['satirlar'] = data['satirlar']
    _mem['secenekler'] = data['secenekler']
    _mem['ts'] = float(data['ts'])
    _mem['error'] = None


def _engine():
    url = (
        f'mssql+pyodbc://{DB_USER}:{DB_PASSWORD}@{DB_SERVER}/{DB_NAME}'
        '?driver=ODBC+Driver+17+for+SQL+Server'
    )
    return create_engine(url)


def prim_raporu_hazirla(force: bool = False) -> tuple[list[dict], dict, float | None, str | None]:
    if not force:
        with _lock:
            if _mem['satirlar'] is not None and (time.time() - _mem['ts']) < _CACHE_TTL:
                return list(_mem['satirlar']), dict(_mem['secenekler']), _mem['ts'], None
        disk = _disk_oku()
        if disk:
            _mem_yukle(disk)
            return list(disk['satirlar']), dict(disk['secenekler']), float(disk['ts']), None
    try:
        engine = _engine()
        with engine.connect() as conn:
            result = conn.execute(text(f'EXEC [dbo].[{SP_NAME}]'))
            cols = list(result.keys())
            raw = result.fetchall()
        rows = [{str(k): v for k, v in zip(cols, r)} for r in raw]
        satirlar = _satirlari_basitlestir(rows)
        secenekler = {}
        ts = time.time()
        payload = {
            'ts': ts, 'sp_name': SP_NAME, 'cache_version': _CACHE_VERSION,
            'satirlar': satirlar, 'secenekler': secenekler,
        }
        _mem_yukle(payload)
        _disk_yaz(satirlar, secenekler)
        logger.info('SP çalıştı: %d satır', len(satirlar))
        return satirlar, secenekler, ts, None
    except Exception as exc:
        msg = str(exc)[:500]
        with _lock:
            _mem['error'] = msg
        logger.error('SP hatası: %s', msg)
        return [], {}, None, msg


# ---------------------------------------------------------------------------
# HTML e-posta şablonu
# ---------------------------------------------------------------------------

def format_tl(value) -> str:
    try:
        v = float(value or 0)
        return f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return '0,00'


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prim Raporu</title>
<style>
  :root {
    --bg:#e9eef4; --panel:#fff; --ink:#0b1220; --ink-soft:#334155;
    --muted:#64748b; --muted-2:#94a3b8; --line:#e6ebf2; --line-soft:#f1f5f9;
    --blue:#2563eb; --blue-deep:#1e40af; --green:#16a34a; --green-ink:#15803d;
    --amber:#f59e0b; --amber-ink:#b45309; --indigo:#6366f1; --sky:#0ea5e9;
    --radius:16px;
  }
  html,body{width:100%!important;min-height:100%;margin:0;padding:0}
  *{box-sizing:border-box}
  body{font-size:15px;background:var(--bg);color:var(--ink);font-family:"Segoe UI",Tahoma,sans-serif;-webkit-text-size-adjust:100%}
  .rapor-govde{width:100%;max-width:none;margin:0;padding:14px 10px 32px}
  .ust-bar{background:linear-gradient(135deg,#0b1220,#1e3a5f);color:#fff;border-radius:18px;padding:24px 28px;margin-bottom:20px}
  .hero-rozet{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd}
  .aciklama{font-size:14.5px;color:#c7d2e0;line-height:1.6;margin:8px 0 0}
  .cache-not{font-size:13px;color:#bae6fd;margin-top:10px}
  .kart-listesi{display:flex;flex-direction:column;gap:22px}
  .kisi-kart{background:var(--panel);border-radius:18px;overflow:hidden;border:1px solid var(--line);margin-bottom:8px}
  .kisi-baslik{background:linear-gradient(135deg,#0b1220,#1e3a5f);color:#fff;padding:20px 24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
  .kisi-isim{font-size:24px;font-weight:800}
  .kisi-meta{font-size:13px;color:#c7d2e0;margin-top:8px}
  .kisi-toplam{text-align:right;background:rgba(255,255,255,.08);border-radius:14px;padding:12px 18px}
  .kisi-toplam .tutar{font-size:26px;font-weight:800;color:#4ade80}
  .kart-govde{padding:16px;background:#f3f6fa}
  .prim-blok{background:#fff;border:1px solid var(--line);border-left:5px solid var(--indigo);border-radius:14px;margin-bottom:14px;overflow:hidden}
  .prim-blok.tahsilat-blok{border-left-color:var(--sky)}
  .prim-blok.hedef-1{border-left-color:var(--amber)}
  .prim-blok-ust{display:block;padding:14px 18px;border-bottom:2px solid var(--line);background:#eef1f8;width:100%}
  .prim-baslik-satir{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}
  .prim-blok-ust h4{margin:0;font-size:17px;font-weight:800;display:inline}
  .blok-rozet{font-size:10px;font-weight:800;text-transform:uppercase;padding:4px 9px;border-radius:7px;background:#eef2f7;border:1px solid #e2e8f0}
  .prim-ozet-table{width:100%;border-collapse:separate;border-spacing:8px;table-layout:fixed}
  .prim-ozet-kart{background:#fff;border-radius:12px;padding:12px 10px;text-align:center;border:2px solid var(--line);vertical-align:top}
  .prim-ozet-kart .etiket{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-2)}
  .prim-ozet-kart .tutar{font-size:20px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums}
  .prim-ozet-kart.toplam{border-color:#c7d2fe;background:#f5f7ff}
  .prim-ozet-kart.toplam .tutar{color:#3730a3}
  .prim-ozet-kart.hakedis{border-color:#bbf7d0;background:#f0fdf4}
  .prim-ozet-kart.hakedis .tutar{color:#15803d}
  .prim-ozet-kart.kalan{border-color:#fde68a;background:#fffbeb}
  .prim-ozet-kart.kalan .tutar{color:#b45309}
  .prim-ozet-kart.sifir .tutar{color:var(--muted-2)}
  .oran-rozet{font-size:14px;font-weight:800;padding:8px 14px;border-radius:12px}
  .oran-rozet.tuttu{background:#dcfce7;color:var(--green-ink)}
  .oran-rozet.tutmadi{background:#fef3c7;color:var(--amber-ink)}
  .kisi-aciklama,.prim-aciklama-kutu{padding:12px 18px;font-size:13px;line-height:1.7;color:var(--ink-soft);border-bottom:1px solid var(--line-soft)}
  .kisi-aciklama .sonuc{display:block;margin-top:8px;font-weight:800}
  .kisi-aciklama .sonuc.tuttu{color:var(--green-ink)}
  .kisi-aciklama .sonuc.tutmadi{color:var(--amber-ink)}
  .blok-tablo-baslik{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted-2);padding:10px 18px 4px}
  .tablo-scroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .ay-tablo{width:100%;min-width:100%;border-collapse:collapse;font-size:12px;table-layout:auto}
  .ay-tablo th,.ay-tablo td{padding:8px 12px;border-bottom:1px solid var(--line-soft)}
  .ay-tablo th{font-size:10px;font-weight:800;color:var(--muted-2);text-transform:uppercase;background:#fafbfc}
  .ay-tablo th.grup-ciro{background:#eef5ff;color:var(--blue-deep);text-align:center}
  .ay-tablo th.grup-tahsilat{background:#e0f2fe;color:#0369a1;text-align:center}
  .ay-tablo th.grup-kar{background:#effdf4;color:var(--green-ink);text-align:center}
  .ay-tablo th.grup-prim{background:#fff7ed;color:var(--amber-ink);text-align:center}
  .hucre-ciro{background:#f6fafe}.hucre-kar{background:#f5fdf8}
  .ay-tablo .para{text-align:right;white-space:nowrap}
  .ay-tablo td.prim-kolon{background:#fffaf3;font-weight:700;color:#92400e;border-left:2px solid #fde2bf}
  .ay-tablo tfoot .toplam-satir td{background:#ecfdf3;color:#14532d;font-weight:800;border-top:2px solid #86efac}
  .yuzde-kum{font-size:13px;font-weight:800;color:var(--blue-deep)}
  .yuzde-kum.tam{color:var(--green-ink)}.yuzde-kum.eksik{color:var(--amber-ink)}
  .yuzde-ay{font-size:11px;color:var(--muted);font-weight:700}
  .bos{color:#cbd5e1}
  .footer{margin-top:30px;font-size:12px;color:var(--muted);text-align:center}
  .dash-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .dash-tbl th,.dash-tbl td{padding:10px 8px;border-bottom:1px solid var(--line-soft)}
  .dash-tbl th{background:#f8fafc;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)}
  .email-header{background:linear-gradient(135deg,#4f46e5,#1d4ed8,#3b82f6);color:#fff;padding:28px 20px;text-align:center;border-radius:16px;margin-bottom:20px}
  .email-header h1{margin:0;font-size:28px;font-weight:800}
  .email-header p{margin:10px 0 0;opacity:.92}
  .section-hdr{font-size:18px;font-weight:800;margin:20px 0 12px;padding:12px 16px;background:#fff;border-radius:12px;border-left:5px solid var(--blue)}
</style>
</head>
<body>
<main class="rapor-govde">
  {% if kisi_adi %}
  <div class="email-header">
    <h1>Merhaba {{ kisi_adi }}!</h1>
    <p>Q{{ ceyrek }} {{ yil }} performans ve prim raporunuz</p>
    {% if cache_tarih %}<p style="font-size:13px;margin-top:8px;opacity:.85">Veri: {{ cache_tarih }}</p>{% endif %}
  </div>
  {% if dashboard_html %}{{ dashboard_html | safe }}{% endif %}
  {% if league_html %}
  <div class="section-hdr">🏆 Lig Sıralaması</div>
  {{ league_html | safe }}
  {% endif %}
  <div class="section-hdr">📊 Prim Detayları</div>
  {% else %}
  <div class="ust-bar">
    <div class="hero-rozet">Prim Raporu · {{ rapor_tarihi }}</div>
    {% if cache_tarih %}<div class="cache-not">Veri: {{ cache_tarih }}</div>{% endif %}
  </div>
  {% endif %}

  <div class="kart-listesi">
  {% for kisi in kartlar %}
    <article class="kisi-kart">
      {% if not kisi_adi %}
      <div class="kisi-baslik">
        <div>
          <div class="kisi-isim">{{ kisi.satici }}</div>
          <div class="kisi-meta">{{ kisi.firma }} · {{ kisi.bolge }}{% if kisi.kod %} · {{ kisi.kod }}{% endif %}</div>
        </div>
      </div>
      {% endif %}
      <div class="kart-govde">
        {% if kisi.hedef_1 %}
        <section class="prim-blok hedef-1">
          <div class="prim-blok-ust">
            <div class="prim-baslik-satir">
              <span class="blok-rozet">1.Hedef</span>
              <h4>{{ kisi.hedef_1.prim_turu }}</h4>
              {% if kisi.hedef_1.aciklama %}
              <span class="oran-rozet {% if kisi.hedef_1.aciklama.tuttu %}tuttu{% else %}tutmadi{% endif %}">{{ kisi.hedef_1.aciklama.baslik }}</span>
              {% endif %}
            </div>
            {{ prim_ozet_kartlari(kisi.hedef_1) }}
          </div>
          {% if kisi.hedef_1.aciklama %}
          <div class="kisi-aciklama">
            <p>{{ kisi.hedef_1.aciklama.satir1 | safe }}</p>
            <p>{{ kisi.hedef_1.aciklama.satir2 | safe }}</p>
            <p>Küm. hedef: <strong>{{ kisi.hedef_1.aciklama.hedef_tl | format_tl }}</strong>,
               yaptı: <strong>{{ kisi.hedef_1.aciklama.yapti_tl | format_tl }}</strong>
               → <strong>%{{ '%.0f'|format(kisi.hedef_1.aciklama.oran) }}</strong></p>
            <p>{{ kisi.hedef_1.aciklama.yil_notu | safe }}</p>
            <span class="sonuc {% if kisi.hedef_1.aciklama.tuttu %}tuttu{% else %}tutmadi{% endif %}">{{ kisi.hedef_1.aciklama.sonuc | safe }}</span>
          </div>
          {% endif %}
          {{ prim_tablo(kisi.hedef_1) }}
        </section>
        {% endif %}
        {% for prim in kisi.primler %}
        <section class="prim-blok {% if prim.tahsilat or prim.prim_davranis_kod == 'hem_ikisi' or ('tahsilat' in prim.prim_turu|lower) %}tahsilat-blok{% endif %}">
          <div class="prim-blok-ust">
            <div class="prim-baslik-satir">
              <span class="blok-rozet">{% if prim.tahsilat or prim.prim_davranis_kod == 'hem_ikisi' or ('tahsilat' in prim.prim_turu|lower) %}Tahsilat{% else %}Prim{% endif %}</span>
              <h4>{{ prim.prim_turu }}</h4>
            </div>
            {{ prim_ozet_kartlari(prim) }}
          </div>
          {% if prim.aciklama %}
          <div class="prim-aciklama-kutu">
            <p>{{ prim.aciklama.davranis | safe }}</p>
            <p>{{ prim.aciklama.hedef_notu | safe }}</p>
          </div>
          {% endif %}
          {{ prim_tablo(prim) }}
        </section>
        {% endfor %}
      </div>
    </article>
  {% endfor %}
  </div>
  <p class="footer">İyi çalışmalar,<br>Evdema Ekibi</p>
</main>
</body>
</html>
"""

PRIM_TABLO_MACRO = r"""
{% macro prim_tablo(k) %}
{% set gk = k.goster_kum|default(true) %}
{% set ga = k.goster_ay|default(false) %}
{% set is_tahsilat = k.tahsilat or k.prim_davranis_kod == 'hem_ikisi' or ('tahsilat' in (k.prim_turu|lower)) %}
{% set ciro_span = (3 if gk else 0) + (3 if ga else 0) %}
{% if ciro_span == 0 %}{% set ciro_span = 3 %}{% endif %}
{% set ns = namespace(ciro_prim=0, kar_prim=0) %}
{% for a in k.aylar %}{% set ns.ciro_prim = ns.ciro_prim + (a.ciro_prim or 0) %}{% set ns.kar_prim = ns.kar_prim + (a.kar_prim or 0) %}{% endfor %}
<div class="tablo-scroll">
<table class="ay-tablo">
<thead>
<tr><th rowspan="2">Ay</th>
<th colspan="{{ ciro_span }}" class="{% if is_tahsilat %}grup-tahsilat{% else %}grup-ciro{% endif %}">{% if is_tahsilat %}TAHSİLAT{% else %}CİRO (SATIŞ){% endif %}</th>
{% if k.kar_var %}<th colspan="{{ ciro_span }}" class="grup-kar">KAR</th>{% endif %}
<th colspan="{{ 2 if k.kar_var else 1 }}" class="grup-prim">PRİM (HAK EDİŞ)</th></tr>
<tr>
{% if gk %}<th class="para">Küm.Hedef</th><th class="para">Küm.Yaptı</th><th class="para">Küm%</th>{% endif %}
{% if ga %}<th class="para">Ay Hedef</th><th class="para">Ay Yaptı</th><th class="para">Ay%</th>{% endif %}
{% if k.kar_var %}{% if gk %}<th class="para">Küm.Hedef</th><th class="para">Küm.Yaptı</th><th class="para">Küm%</th>{% endif %}
{% if ga %}<th class="para">Ay Hedef</th><th class="para">Ay Yaptı</th><th class="para">Ay%</th>{% endif %}{% endif %}
<th class="para">{% if is_tahsilat %}Tahsilat Primi{% else %}Ciro Primi{% endif %}</th>{% if k.kar_var %}<th class="para">Kar Primi</th>{% endif %}
</tr></thead>
<tbody>
{% for a in k.aylar %}
<tr><td><strong>{{ a.donem }}</strong></td>
{% if a.ciro_var %}
  {% if gk %}<td class="para hucre-ciro">{{ a.ciro_hedef | format_tl }}</td><td class="para hucre-ciro">{{ a.ciro | format_tl }}</td>
  <td class="para hucre-ciro">{{ yuzde_hucre(a.ciro_yuzde_kum, true) }}</td>{% endif %}
  {% if ga %}<td class="para hucre-ciro">{{ a.ciro_hedef_ay | format_tl }}</td><td class="para hucre-ciro">{{ a.ciro_ay | format_tl }}</td>
  <td class="para hucre-ciro">{{ yuzde_hucre(a.ciro_yuzde_ay, false) }}</td>{% endif %}
{% else %}<td colspan="{{ ciro_span }}" class="bos">—</td>{% endif %}
{% if k.kar_var %}
  {% if a.kar_var %}
    {% if gk %}<td class="para hucre-kar">{{ a.kar_hedef | format_tl }}</td><td class="para hucre-kar">{{ a.kar | format_tl }}</td>
    <td class="para hucre-kar">{{ yuzde_hucre(a.kar_yuzde_kum, true) }}</td>{% endif %}
    {% if ga %}<td class="para hucre-kar">{{ a.kar_hedef_ay | format_tl }}</td><td class="para hucre-kar">{{ a.kar_ay | format_tl }}</td>
    <td class="para hucre-kar">{{ yuzde_hucre(a.kar_yuzde_ay, false) }}</td>{% endif %}
  {% else %}<td colspan="{{ ciro_span }}" class="bos">—</td>{% endif %}
{% endif %}
<td class="para prim-kolon">{% if a.ciro_prim > 0 %}{{ a.ciro_prim | format_tl }}{% else %}—{% endif %}</td>
{% if k.kar_var %}<td class="para prim-kolon">{% if a.kar_prim > 0 %}{{ a.kar_prim | format_tl }}{% else %}—{% endif %}</td>{% endif %}
</tr>{% endfor %}
</tbody>
<tfoot><tr class="toplam-satir">
<td colspan="{{ 1 + ciro_span + (ciro_span if k.kar_var else 0) }}" style="text-align:right">Toplam hak ediş</td>
<td class="para prim-kolon">{% if ns.ciro_prim > 0 %}{{ ns.ciro_prim | format_tl }}{% else %}—{% endif %}</td>
{% if k.kar_var %}<td class="para prim-kolon">{% if ns.kar_prim > 0 %}{{ ns.kar_prim | format_tl }}{% else %}—{% endif %}</td>{% endif %}
</tr></tfoot>
</table></div>
{% endmacro %}
"""

YUZDE_HUCRE_MACRO = r"""
{% macro yuzde_hucre(deger, kumulatif) %}
{% set p = deger or 0 %}
{% if kumulatif %}
<span class="yuzde-kum {% if p >= 100 %}tam{% else %}eksik{% endif %}">%{{ '%.0f'|format(p) }}</span>
{% else %}
<span class="yuzde-ay">%{{ '%.0f'|format(p) }}</span>
{% endif %}
{% endmacro %}
"""

PRIM_OZET_KARTLARI_MACRO = r"""
{% macro prim_ozet_kartlari(k) %}
<table class="prim-ozet-table" cellpadding="0" cellspacing="0">
  <tr>
    <td width="33%" class="prim-ozet-kart toplam {% if (k.toplam_prim_ucreti or 0) <= 0 %}sifir{% endif %}">
      <div class="etiket">Prim ücreti toplamı</div>
      <div class="tutar">{{ k.toplam_prim_ucreti | format_tl }}</div>
    </td>
    <td width="33%" class="prim-ozet-kart hakedis {% if (k.toplam_hakedis or 0) <= 0 %}sifir{% endif %}">
      <div class="etiket">Hakediş</div>
      <div class="tutar">{{ k.toplam_hakedis | format_tl }}</div>
    </td>
    <td width="33%" class="prim-ozet-kart kalan {% if (k.toplam_kalan or 0) <= 0 %}sifir{% endif %}">
      <div class="etiket">Kalan</div>
      <div class="tutar">{{ k.toplam_kalan | format_tl }}</div>
    </td>
  </tr>
</table>
{% endmacro %}
"""


def _jinja_template():
    env = Environment(autoescape=select_autoescape(['html']))
    env.filters['format_tl'] = format_tl
    full = YUZDE_HUCRE_MACRO + PRIM_OZET_KARTLARI_MACRO + PRIM_TABLO_MACRO + HTML_TEMPLATE
    return env.from_string(full)


def html_olustur(
    kartlar: list[dict],
    cache_ts: float | None,
    *,
    kisi_adi: str = '',
    dashboard_html: str = '',
    league_html: str = '',
) -> str:
    tpl = _jinja_template()
    cache_tarih = datetime.fromtimestamp(cache_ts).strftime('%d.%m.%Y %H:%M') if cache_ts else ''
    now = datetime.now()
    return tpl.render(
        kartlar=kartlar,
        toplam_kart=len(kartlar),
        toplam_kayit=sum(k['prim_sayisi'] for k in kartlar),
        cache_tarih=cache_tarih,
        rapor_tarihi=now.strftime('%d.%m.%Y'),
        kisi_adi=kisi_adi,
        dashboard_html=dashboard_html,
        league_html=league_html,
        ceyrek=(now.month - 1) // 3 + 1,
        yil=now.year,
    )


# ---------------------------------------------------------------------------
# E-posta gönderimi
# ---------------------------------------------------------------------------


def mail_gonder(konu: str, html: str, alicilar: list[str], cc: list[str] | None = None) -> None:
    if not alicilar:
        raise ValueError('Alıcı yok')
    if not EMAIL_PASSWORD:
        raise ValueError('EMAIL_PASSWORD tanımlı değil')
    msg = MIMEMultipart()
    msg['From'] = EMAIL_SENDER
    msg['To'] = ', '.join(alicilar)
    if cc:
        msg['Cc'] = ', '.join(cc)
    msg['Subject'] = konu
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        recipients = list(alicilar) + (cc or [])
        server.sendmail(EMAIL_SENDER, recipients, msg.as_string())
    logger.info('E-posta gönderildi → %s', msg['To'])


# ---------------------------------------------------------------------------
# Ana akış
# ---------------------------------------------------------------------------


def main() -> int:
    force = '--force' in sys.argv or os.environ.get('PRIM_RAPORU_FORCE', '').lower() in ('1', 'true', 'yes')
    satirlar, _, cache_ts, hata = prim_raporu_hazirla(force=force)
    if hata:
        logger.error('Veri alınamadı: %s', hata)
        print(f'HATA: {hata}', file=sys.stderr)
        return 1
    if not satirlar:
        logger.warning('Boş veri seti')
        print('Uyarı: SP boş döndü', file=sys.stderr)
        return 2

    filtrelenmis = filtrele_basit(
        satirlar,
        firma=os.environ.get('PRIM_RAPORU_FILTRE_FIRMA', ''),
        butce_yoneticisi=os.environ.get('PRIM_RAPORU_FILTRE_YONETICI', ''),
        kar_merkezi=os.environ.get('PRIM_RAPORU_FILTRE_BOLGE', ''),
        primaciklama=os.environ.get('PRIM_RAPORU_FILTRE_PRIM', ''),
        donem=os.environ.get('PRIM_RAPORU_FILTRE_DONEM', ''),
        yil=os.environ.get('PRIM_RAPORU_FILTRE_YIL', ''),
        arama=os.environ.get('PRIM_RAPORU_FILTRE_ARAMA', ''),
    )

    full_df = _satirlar_to_df(filtrelenmis)
    league_all = _league_tables_all(full_df)

    if KISI_BASLI and '--toplu' not in sys.argv:
        gonderilen = 0
        gruplar: dict[tuple, list[dict]] = {}
        for s in filtrelenmis:
            key = (s['satici'], s['bolge'])
            gruplar.setdefault(key, []).append(s)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            for (satici, bolge), k_satirlar in gruplar.items():
                if MAX_KISI > 0 and gonderilen >= MAX_KISI:
                    break
                mail = next((x['mail'] for x in k_satirlar if x.get('mail')), '')
                if not mail:
                    logger.warning('Mail yok, atlandı: %s - %s', satici, bolge)
                    continue
                mailcc = next((x['mailcc'] for x in k_satirlar if x.get('mailcc')), '')
                cc = ['yasincakal@evdema.com']
                if mailcc:
                    cc.extend(a.strip() for a in mailcc.split(',') if a.strip())
                km_df = _satirlar_to_df(k_satirlar)
                kartlar = grupla_kisi_kartlari(k_satirlar)
                html = html_olustur(
                    kartlar, cache_ts,
                    kisi_adi=satici,
                    dashboard_html=_dashboard_hedef_html(km_df),
                    league_html=_league_html_for_person(km_df, league_all),
                )
                if '--html-only' in sys.argv:
                    safe = re.sub(r'[^\w\-]', '_', satici)[:30]
                    out = Path(os.environ.get('PRIM_RAPORU_HTML_OUT', f'prim_{safe}.html'))
                    out.write_text(html, encoding='utf-8')
                    print(f'HTML: {out}')
                    continue
                konu = (
                    f'Satış Analiz Raporu - {satici} - {bolge} '
                    f'({datetime.now().strftime("%m/%Y")})'
                )
                msg = MIMEMultipart()
                msg['From'] = EMAIL_SENDER
                msg['To'] = mail
                msg['Cc'] = ', '.join(cc)
                msg['Subject'] = konu
                msg.attach(MIMEText(html, 'html', 'utf-8'))
                try:
                    smtp.sendmail(EMAIL_SENDER, [mail, *cc], msg.as_string())
                    gonderilen += 1
                    logger.info('Gönderildi: %s (%s)', mail, satici)
                    print(f'OK: {satici} → {mail}')
                except Exception as exc:
                    logger.error('Gönderilemedi %s: %s', satici, exc)
                    print(f'HATA {satici}: {exc}', file=sys.stderr)
        print(f'Toplam {gonderilen} kişiye gönderildi')
        return 0

    kartlar = grupla_kisi_kartlari(filtrelenmis)
    if MAX_KISI > 0:
        kartlar = kartlar[:MAX_KISI]
    html = html_olustur(kartlar, cache_ts)
    if '--html-only' in sys.argv:
        out = Path(os.environ.get('PRIM_RAPORU_HTML_OUT', 'prim_raporu.html'))
        out.write_text(html, encoding='utf-8')
        print(f'HTML yazıldı: {out}')
        return 0
    yil = datetime.now().year
    konu = os.environ.get('PRIM_RAPORU_MAIL_KONU', f'{yil} Prim Raporu — {len(kartlar)} satışçı')
    mail_gonder(konu, html, EMAIL_TO)
    print(f'OK: toplu mail, {len(kartlar)} satışçı')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
