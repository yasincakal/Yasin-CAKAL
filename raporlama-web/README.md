# Raporlama Programı (Web)

Logo Tiger ERP raporlarını Excel makroları yerine web üzerinden sunan ayrı bir proje.

## Özellikler

- Veritabanı bağlantı ayarları (kalıcı kayıt)
- Firma / dönem seçimi
- Eksik `BAYRAK_{firma}_{donem}_*` view'larını otomatik oluşturma
- Global tarih aralığı + **Raporları Güncelle**
- Dashboard (satış, kar, banka, kredi, negatif stok)
- Raporlar:
  - A-1 Yönetim Karlılık
  - A-2 Banka Rapor
  - A-3 Banka Kredi
  - B-1 Fatura Karlılık Detay
  - B-2 Hizmet Gideri
  - B-3 Personel Gideri
  - C-2 Negatif Stok
- SQL Server yoksa **Demo ile Devam**

## Çalıştırma

```bash
cd raporlama-web
npm install
npm run dev
```

Tarayıcı: http://localhost:3000

## Üretim

```bash
npm run build
npm start
```

## Yapılandırma

Bağlantı bilgileri `data/db-config.json`, aktif oturum `data/session.json` dosyalarına yazılır.

View şablonları: `sql/views/*.sql` (`{{FIRMA}}` / `{{DONEM}}` yer tutucuları).

## Not

Bu uygulama cari hesap web’den bağımsızdır; yalnızca raporlama içindir.
