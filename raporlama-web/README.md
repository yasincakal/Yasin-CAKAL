# Raporlama Programı (Web) — Windows PC / Ağ

Logo Tiger ERP raporlarını Chrome üzerinden, ağdaki birden fazla kullanıcının kullanabileceği ayrı proje.

## PC / ağ erişimi

1. ZIP indir: https://github.com/yasincakal/Yasin-CAKAL/archive/refs/heads/cursor/raporlama-web-e0d0.zip
2. `raporlama-web` klasörünü örn. `C:\Users\pc34\raporlama-web` yap
3. [Node.js LTS](https://nodejs.org) kur
4. `KURULUM.bat` → `BASLAT.bat`

Adresler:
- Bu PC: `http://localhost:3000/Raporlar`
- Ağ: `http://192.168.x.x:3000/Raporlar`

Windows Güvenlik Duvarı’nda **3000** portuna izin verin.

## Özellikler

- SQL bağlantı + firma/dönem + otomatik view
- Dashboard (satış, kar, banka, kredi, **cari borçlu/alacaklı**)
- Cari bakiyeler (bitiş tarihine kadar kümülatif, sekmeler, dip toplam)
- Tüm raporlarda **Sütunlar** (gizli alanları aç/kapat)
- **PDF / Excel** kaydet
- Negatif stok ayrı menüde
- **Mali Tablolar** altında KDV Raporu (191 indirilecek / 391 hesaplanan)

Ayar dosyası: `C:\ProgramData\RaporlamaWeb\`
