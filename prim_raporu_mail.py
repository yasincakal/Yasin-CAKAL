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
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from jinja2 import Environment, select_autoescape
from sqlalchemy import create_engine, text

load_dotenv()

# ---------------------------------------------------------------------------
# Yapılandırma
# ---------------------------------------------------------------------------

SP_NAME = os.environ.get('PRIM_RAPORU_SP', 'YasinprimHesapla')
_CACHE_TTL = int(os.environ.get('PRIM_RAPORU_CACHE_TTL', '14400'))
_CACHE_VERSION = 9
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
        odenen_ciro = _float_val(_row_key(r, 'Ödenen Ciro Primi'))
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
        toplam_prim = round(ciro_prim + kar_prim, 2)
        toplam_odenen = round(odenen_ciro + odenen_kar, 2)
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
            'alacagi_prim': toplam_prim, 'odenen': toplam_odenen,
            'kalan': round(toplam_prim - toplam_odenen, 2),
            'oncelik': oncelik, 'birincil_hedef': birincil_hedef,
            'hedef_oran_sp': _float_val(_row_key(r, 'HedefOran')),
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
        'alacagi_prim': s['alacagi_prim'],
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
        'toplam_prim': round(sum(a['alacagi_prim'] for a in aylar), 2),
        'toplam_ciro_prim': round(sum(a['ciro_prim'] for a in aylar), 2),
        'toplam_kar_prim': round(sum(a['kar_prim'] for a in aylar), 2),
        'toplam_odenen': round(sum(a['odenen'] for a in aylar), 2),
        'toplam_kalan': round(sum(a['kalan'] for a in aylar), 2),
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
  *{box-sizing:border-box} body{margin:0;font-size:15px;background:var(--bg);color:var(--ink);font-family:"Segoe UI",Tahoma,sans-serif}
  .rapor-govde{width:100%;max-width:1100px;margin:0 auto;padding:22px 20px 40px}
  .ust-bar{background:linear-gradient(135deg,#0b1220,#1e3a5f);color:#fff;border-radius:18px;padding:24px 28px;margin-bottom:20px}
  .hero-rozet{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd}
  .aciklama{font-size:14.5px;color:#c7d2e0;line-height:1.6;margin:8px 0 0}
  .cache-not{font-size:13px;color:#bae6fd;margin-top:10px}
  .ozet-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
  .ozet-item{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
  .ozet-item span{font-size:11px;color:var(--muted-2);text-transform:uppercase;font-weight:800}
  .ozet-item strong{display:block;font-size:22px;font-weight:800;margin-top:4px}
  .ozet-item.prim strong{color:var(--green)}
  .sayim-satir{font-size:13px;color:var(--muted-2);margin-bottom:14px;font-weight:600}
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
  .prim-blok-ust{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 18px;border-bottom:2px solid var(--line);background:#eef1f8}
  .prim-blok-ust h4{margin:0;font-size:17px;font-weight:800}
  .blok-rozet{font-size:10px;font-weight:800;text-transform:uppercase;padding:4px 9px;border-radius:7px;background:#eef2f7;border:1px solid #e2e8f0}
  .hakedis-chip{text-align:right;background:#fff;border:2px solid #bbf7d0;border-radius:12px;padding:8px 16px}
  .hakedis-chip .tutar{font-size:22px;font-weight:800;color:#15803d}
  .oran-rozet{font-size:14px;font-weight:800;padding:8px 14px;border-radius:12px}
  .oran-rozet.tuttu{background:#dcfce7;color:var(--green-ink)}
  .oran-rozet.tutmadi{background:#fef3c7;color:var(--amber-ink)}
  .kisi-aciklama,.prim-aciklama-kutu{padding:12px 18px;font-size:13px;line-height:1.7;color:var(--ink-soft);border-bottom:1px solid var(--line-soft)}
  .kisi-aciklama .sonuc{display:block;margin-top:8px;font-weight:800}
  .kisi-aciklama .sonuc.tuttu{color:var(--green-ink)}
  .kisi-aciklama .sonuc.tutmadi{color:var(--amber-ink)}
  .blok-tablo-baslik{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted-2);padding:10px 18px 4px}
  .ay-tablo{width:100%;border-collapse:collapse;font-size:12px}
  .ay-tablo th,.ay-tablo td{padding:8px 12px;border-bottom:1px solid var(--line-soft)}
  .ay-tablo th{font-size:10px;font-weight:800;color:var(--muted-2);text-transform:uppercase;background:#fafbfc}
  .ay-tablo th.grup-ciro{background:#eef5ff;color:var(--blue-deep);text-align:center}
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
  .kurallar{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;font-size:13px;line-height:1.7;color:var(--ink-soft)}
  .kurallar h4{margin:12px 0 6px;font-size:14px;color:var(--ink)}
</style>
</head>
<body>
<main class="rapor-govde">
  <div class="ust-bar">
    <div class="hero-rozet">Prim Raporu · {{ rapor_tarihi }}</div>
    <p class="aciklama">Üstte kişinin <strong>toplam hak edişi</strong>, altında <strong>her prim türü ayrı kutu</strong> olarak gösterilir.</p>
    {% if cache_tarih %}<div class="cache-not">Veri: {{ cache_tarih }}</div>{% endif %}
  </div>

  <div class="kurallar">
    <h4>Ödeme mantığı</h4>
    <ul>
      <li><strong>Tüm primler aylık ödenir.</strong> Kümülatif primde o ay %100 olursa geçmiş aylar da ödenir.</li>
      <li><strong>1.Hedef</strong> tutmazsa ona tabi primler ödenmez (tahsilat, aylık bağımsız vb. hariç).</li>
    </ul>
  </div>

  <div class="ozet-strip">
    <div class="ozet-item"><span>Satışçı</span><strong>{{ ozet.kisi }}</strong></div>
    <div class="ozet-item"><span>Toplam ciro</span><strong>{{ ozet.toplam_ciro | format_tl }}</strong></div>
    <div class="ozet-item"><span>Toplam kar</span><strong>{{ ozet.toplam_kar | format_tl }}</strong></div>
    <div class="ozet-item prim"><span>Alınacak prim</span><strong>{{ ozet.toplam_prim | format_tl }}</strong></div>
  </div>
  <p class="sayim-satir">{{ toplam_kart }} satışçı · {{ toplam_kayit }} kayıt</p>

  <div class="kart-listesi">
  {% for kisi in kartlar %}
    <article class="kisi-kart">
      <div class="kisi-baslik">
        <div>
          <div class="kisi-isim">{{ kisi.satici }}</div>
          <div class="kisi-meta">{{ kisi.firma }} · {{ kisi.bolge }}{% if kisi.kod %} · {{ kisi.kod }}{% endif %}</div>
        </div>
        <div class="kisi-toplam">
          <div style="font-size:11px;color:#9fb0c5">Toplam hak ediş</div>
          <div class="tutar">{{ kisi.toplam_prim | format_tl }}</div>
          <div style="font-size:12px;color:#9fb0c5">{{ kisi.prim_sayisi }} prim türü</div>
        </div>
      </div>
      <div class="kart-govde">
        {% if kisi.hedef_1 %}
        <section class="prim-blok hedef-1">
          <div class="prim-blok-ust">
            <div><span class="blok-rozet">1.Hedef</span> <h4 style="display:inline">{{ kisi.hedef_1.prim_turu }}</h4></div>
            {% if kisi.hedef_1.aciklama %}
            <span class="oran-rozet {% if kisi.hedef_1.aciklama.tuttu %}tuttu{% else %}tutmadi{% endif %}">{{ kisi.hedef_1.aciklama.baslik }}</span>
            {% endif %}
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
        <section class="prim-blok {% if prim.tahsilat %}tahsilat-blok{% endif %}">
          <div class="prim-blok-ust">
            <div><span class="blok-rozet">{% if prim.tahsilat %}Tahsilat{% else %}Prim{% endif %}</span>
              <h4 style="display:inline">{{ prim.prim_turu }}</h4></div>
            <div class="hakedis-chip"><div style="font-size:10px;color:#16a34a">Hak ediş</div>
              <div class="tutar">{{ prim.toplam_prim | format_tl }}</div></div>
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
{% set ciro_span = (3 if gk else 0) + (3 if ga else 0) %}
{% if ciro_span == 0 %}{% set ciro_span = 3 %}{% endif %}
{% set ns = namespace(ciro_prim=0, kar_prim=0) %}
{% for a in k.aylar %}{% set ns.ciro_prim = ns.ciro_prim + (a.ciro_prim or 0) %}{% set ns.kar_prim = ns.kar_prim + (a.kar_prim or 0) %}{% endfor %}
<div style="overflow-x:auto">
<table class="ay-tablo">
<thead>
<tr><th rowspan="2">Ay</th>
<th colspan="{{ ciro_span }}" class="grup-ciro">{% if k.tahsilat %}TAHSİLAT{% else %}CİRO{% endif %}</th>
{% if k.kar_var %}<th colspan="{{ ciro_span }}" class="grup-kar">KAR</th>{% endif %}
<th colspan="{{ 2 if k.kar_var else 1 }}" class="grup-prim">PRİM</th></tr>
<tr>
{% if gk %}<th class="para">Küm.Hedef</th><th class="para">Küm.Yaptı</th><th class="para">Küm%</th>{% endif %}
{% if ga %}<th class="para">Ay Hedef</th><th class="para">Ay Yaptı</th><th class="para">Ay%</th>{% endif %}
{% if k.kar_var %}{% if gk %}<th class="para">Küm.Hedef</th><th class="para">Küm.Yaptı</th><th class="para">Küm%</th>{% endif %}
{% if ga %}<th class="para">Ay Hedef</th><th class="para">Ay Yaptı</th><th class="para">Ay%</th>{% endif %}{% endif %}
<th class="para">Ciro Primi</th>{% if k.kar_var %}<th class="para">Kar Primi</th>{% endif %}
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


def _jinja_template():
    env = Environment(autoescape=select_autoescape(['html']))
    env.filters['format_tl'] = format_tl
    full = YUZDE_HUCRE_MACRO + PRIM_TABLO_MACRO + HTML_TEMPLATE
    return env.from_string(full)


def html_olustur(kartlar: list[dict], ozet: dict, cache_ts: float | None) -> str:
    tpl = _jinja_template()
    cache_tarih = datetime.fromtimestamp(cache_ts).strftime('%d.%m.%Y %H:%M') if cache_ts else ''
    return tpl.render(
        kartlar=kartlar,
        ozet=ozet,
        toplam_kart=len(kartlar),
        toplam_kayit=sum(k['prim_sayisi'] for k in kartlar),
        cache_tarih=cache_tarih,
        rapor_tarihi=datetime.now().strftime('%d.%m.%Y'),
    )


# ---------------------------------------------------------------------------
# E-posta gönderimi
# ---------------------------------------------------------------------------


def mail_gonder(konu: str, html: str, alicilar: list[str] | None = None) -> None:
    alicilar = alicilar or EMAIL_TO
    if not alicilar:
        raise ValueError('EMAIL_TO tanımlı değil')
    if not EMAIL_PASSWORD:
        raise ValueError('EMAIL_PASSWORD tanımlı değil')
    msg = MIMEMultipart()
    msg['From'] = EMAIL_SENDER
    msg['To'] = ', '.join(alicilar)
    msg['Subject'] = konu
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.send_message(msg)
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
    kartlar = grupla_kisi_kartlari(filtrelenmis)
    if MAX_KISI > 0:
        kartlar = kartlar[:MAX_KISI]
    ozet = basit_ozet(filtrelenmis)
    html = html_olustur(kartlar, ozet, cache_ts)

    if '--html-only' in sys.argv:
        out = Path(os.environ.get('PRIM_RAPORU_HTML_OUT', 'prim_raporu.html'))
        out.write_text(html, encoding='utf-8')
        print(f'HTML yazıldı: {out}')
        return 0

    yil = datetime.now().year
    konu = os.environ.get(
        'PRIM_RAPORU_MAIL_KONU',
        f'{yil} Prim Raporu — {len(kartlar)} satışçı',
    )
    mail_gonder(konu, html)
    print(f'OK: {len(kartlar)} satışçı, {len(EMAIL_TO)} alıcı')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
