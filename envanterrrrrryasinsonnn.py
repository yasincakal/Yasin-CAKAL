import smtplib
import pandas as pd
from sqlalchemy import create_engine
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import logging

# Logging ayarları
logging.basicConfig(filename='email_script_debug.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Çevre değişkenlerini yükle
load_dotenv()
server = os.getenv("DB_SERVER", "192.168.0.222\\logo")
database = os.getenv("DB_NAME", "LOGO")
username = os.getenv("DB_USER", "sa2")
password = os.getenv("DB_PASSWORD", "Evdema1956!!")
sender = os.getenv("EMAIL_SENDER", "butce@evdema.com")
email_password = os.getenv("EMAIL_PASSWORD", "Butce123+")

# SQL Server bağlantısı
engine = create_engine(f'mssql+pyodbc://{username}:{password}@{server}/{database}?driver=ODBC+Driver+17+for+SQL+Server')

# Dinamik tarihler
current_year = datetime.now().year  # Örneğin, 2025
last_year = current_year - 1  # Örneğin, 2024

# Geçen yıl için tarih aralığı (1 Ocak - 31 Aralık)
satış_ilktarih_last_year = f"{last_year}0101"
satış_sontarih_last_year = f"{last_year}1231"

# Mevcut yıl için tarih aralığı (1 Ocak - mevcut tarih)
satış_ilktarih_current_year = f"{current_year}0101"
satış_sontarih_current_year = datetime.now().strftime("%Y%m%d")

# Mevcut yıl için ay sonu tarihlerini hesapla
start_date = datetime(current_year, 1, 1)
end_date = min(datetime.now(), datetime(current_year, 4, 30))

def get_month_end_dates(start_date, end_date):
    current_date = start_date
    month_end_dates = []
    while current_date <= end_date:
        next_month = current_date.replace(day=28) + timedelta(days=4)
        month_end = next_month - timedelta(days=next_month.day)
        month_end_dates.append(month_end)
        current_date = month_end + timedelta(days=1)
    return month_end_dates

month_end_dates = get_month_end_dates(start_date, end_date)

# KalanTutar verilerini topla (mevcut yıl, kümülatif)
all_data = []
for month_end in month_end_dates:
    month_end_str = month_end.strftime("%Y%m%d")
    month_label = month_end.strftime("%d.%m.%Y")
    try:
        df = pd.read_sql(
            f"EXEC [dbo].[YASINCAKALPRIMYAVUZENVANTER] '{month_end_str}', '{satış_ilktarih_current_year}', '{month_end_str}'", 
            engine
        )
        
        numeric_columns = df.select_dtypes(include=['float64', 'int64']).columns
        df[numeric_columns] = df[numeric_columns].fillna(0)
        df['Kategori'] = df['Kategori'].str.strip()
        df['GrupAdı'] = df['GrupAdı'].str.strip()
        df['Month'] = month_label
        
        grouped_df = df.groupby(['Kategori', 'GrupAdı', 'Month']).agg({
            'KalanTutar': 'sum',
            'KarOranı': 'mean'  # KarOranı'nı ortalama olarak alıyoruz
        }).reset_index()
        all_data.append(grouped_df)
        
        logging.debug(f"KalanTutar ve KarOranı verisi çekildi ({month_label}): {len(grouped_df)} satır")
        if not grouped_df.empty:
            logging.debug(f"KalanTutar ve KarOranı örnek veri ({month_label}): {grouped_df.head().to_dict()}")
        
    except Exception as e:
        logging.error(f"KalanTutar ve KarOranı veri çekme hatası ({month_end_str}): {str(e)}")

# Sipariş verileri (mevcut yıl)
try:
    siparis_df = pd.read_sql(
        f"EXEC [dbo].[YASINCAKALPRIMYAVUZENVANTER] '{month_end_str}', '{satış_ilktarih_current_year}', '{satış_sontarih_current_year}'", 
        engine
    )
    
    numeric_columns = siparis_df.select_dtypes(include=['float64', 'int64']).columns
    siparis_df[numeric_columns] = siparis_df[numeric_columns].fillna(0)
    siparis_df['Kategori'] = siparis_df['Kategori'].str.strip()
    siparis_df['GrupAdı'] = siparis_df['GrupAdı'].str.strip()
    
    logging.debug(f"Prosedür sütunları (Sipariş, {current_year}): {siparis_df.columns.tolist()}")
    if not siparis_df.empty:
        logging.debug(f"Sipariş örnek veri ({current_year}): {siparis_df.head().to_dict()}")
    
    alis_siparis_tutar = siparis_df.groupby(['Kategori', 'GrupAdı'])['AlışSiparişTutarı'].sum().reset_index() if 'AlışSiparişTutarı' in siparis_df.columns else pd.DataFrame(columns=['Kategori', 'GrupAdı', 'AlışSiparişTutarı'])
    satis_siparis_tutar = siparis_df.groupby(['Kategori', 'GrupAdı'])['SatışSiparişTutarı'].sum().reset_index() if 'SatışSiparişTutarı' in siparis_df.columns else pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışSiparişTutarı'])
    kar_orani = siparis_df.groupby(['Kategori', 'GrupAdı'])['KarOranı'].mean().reset_index() if 'KarOranı' in siparis_df.columns else pd.DataFrame(columns=['Kategori', 'GrupAdı', 'KarOranı'])
    
except Exception as e:
    logging.error(f"Sipariş verileri çekme hatası ({current_year}): {str(e)}")
    alis_siparis_tutar = pd.DataFrame(columns=['Kategori', 'GrupAdı', 'AlışSiparişTutarı'])
    satis_siparis_tutar = pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışSiparişTutarı'])
    kar_orani = pd.DataFrame(columns=['Kategori', 'GrupAdı', 'KarOranı'])

# SatışTutarı (geçen yıl)
try:
    satis_df_last_year = pd.read_sql(
        f"EXEC [dbo].[YASINCAKALPRIMYAVUZENVANTER] '{month_end_str}', '{satış_ilktarih_last_year}', '{satış_sontarih_last_year}'", 
        engine
    )
    
    numeric_columns = satis_df_last_year.select_dtypes(include=['float64', 'int64']).columns
    satis_df_last_year[numeric_columns] = satis_df_last_year[numeric_columns].fillna(0)
    satis_df_last_year['Kategori'] = satis_df_last_year['Kategori'].str.strip()
    satis_df_last_year['GrupAdı'] = satis_df_last_year['GrupAdı'].str.strip()
    
    satis_tutar_last_year = satis_df_last_year.groupby(['Kategori', 'GrupAdı'])['SatışTutarı'].sum().reset_index() if 'SatışTutarı' in satis_df_last_year.columns else pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışTutarı'])
    
except Exception as e:
    logging.error(f"SatışTutarı verisi çekme hatası ({last_year}): {str(e)}")
    satis_tutar_last_year = pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışTutarı'])

# SatışTutarı (mevcut yıl)
try:
    satis_df_current_year = pd.read_sql(
        f"EXEC [dbo].[YASINCAKALPRIMYAVUZENVANTER] '{month_end_str}', '{satış_ilktarih_current_year}', '{satış_sontarih_current_year}'", 
        engine
    )
    
    numeric_columns = satis_df_current_year.select_dtypes(include=['float64', 'int64']).columns
    satis_df_current_year[numeric_columns] = satis_df_current_year[numeric_columns].fillna(0)
    satis_df_current_year['Kategori'] = satis_df_current_year['Kategori'].str.strip()
    satis_df_current_year['GrupAdı'] = satis_df_current_year['GrupAdı'].str.strip()
    
    satis_tutar_current_year = satis_df_current_year.groupby(['Kategori', 'GrupAdı'])['SatışTutarı'].sum().reset_index() if 'SatışTutarı' in satis_df_current_year.columns else pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışTutarı'])
    
except Exception as e:
    logging.error(f"SatışTutarı verisi çekme hatası ({current_year}): {str(e)}")
    satis_tutar_current_year = pd.DataFrame(columns=['Kategori', 'GrupAdı', 'SatışTutarı'])

# Verileri birleştir ve pivot tablo oluştur
if all_data:
    combined_df = pd.concat(all_data, ignore_index=True)
    
    # Kategori ve GrupAdı için pivot tablo
    pivot_df = combined_df.pivot_table(
        index=['Kategori', 'GrupAdı'],
        columns='Month',
        values=['KalanTutar', 'KarOranı'],
        aggfunc={'KalanTutar': 'sum', 'KarOranı': 'mean'},
        fill_value=0
    ).reset_index()
    
    # Çok seviyeli sütun isimlerini düzleştir
    pivot_df.columns = ['Kategori', 'GrupAdı'] + [
        f"{month} {val}" for val, month in pivot_df.columns[2:]
    ]
    
    # Mevcut sütunları logla
    logging.debug(f"pivot_df sütunları (merge öncesi): {pivot_df.columns.tolist()}")
    
    # AlışSiparişTutarı
    if not alis_siparis_tutar.empty:
        pivot_df = pivot_df.merge(alis_siparis_tutar, on=['Kategori', 'GrupAdı'], how='left')
        pivot_df['Alış Sipariş Tutarı'] = pivot_df['AlışSiparişTutarı'].fillna(0)
        pivot_df = pivot_df.drop(columns=['AlışSiparişTutarı'], errors='ignore')
    
    # SatışSiparişTutarı
    if not satis_siparis_tutar.empty:
        pivot_df = pivot_df.merge(satis_siparis_tutar, on=['Kategori', 'GrupAdı'], how='left')
        pivot_df['Satış Sipariş Tutarı'] = pivot_df['SatışSiparişTutarı'].fillna(0)
        pivot_df = pivot_df.drop(columns=['SatışSiparişTutarı'], errors='ignore')
    
    # SatışTutarı (geçen yıl)
    if not satis_tutar_last_year.empty:
        pivot_df = pivot_df.merge(satis_tutar_last_year, on=['Kategori', 'GrupAdı'], how='left')
        pivot_df[f'Satış Tutarı ({last_year})'] = pivot_df['SatışTutarı'].fillna(0)
        pivot_df = pivot_df.drop(columns=['SatışTutarı'], errors='ignore')
    
    # SatışTutarı (mevcut yıl)
    if not satis_tutar_current_year.empty:
        pivot_df = pivot_df.merge(satis_tutar_current_year, on=['Kategori', 'GrupAdı'], how='left')
        pivot_df[f'Satış Tutarı ({current_year})'] = pivot_df['SatışTutarı'].fillna(0)
        pivot_df = pivot_df.drop(columns=['SatışTutarı'], errors='ignore')
    
    # KarOranı
    if not kar_orani.empty:
        pivot_df = pivot_df.merge(kar_orani, on=['Kategori', 'GrupAdı'], how='left')
        pivot_df['KarOranı'] = pivot_df['KarOranı'].fillna(0)
    
    # Net Envanter
    last_month = month_end_dates[-1].strftime("%d.%m.%Y")
    pivot_df['Net Envanter'] = pivot_df[f"{last_month} KalanTutar"] + pivot_df['Alış Sipariş Tutarı'] - pivot_df['Satış Sipariş Tutarı']
    
    # Yeni hesaplamalar
  
    
    # 2. Hedef Ciro: Geçen yılın iki katı
    pivot_df['Bütçe'] = pivot_df[f'Satış Tutarı ({last_year})'] * 2
    

    
    # 4. Bütçe Açığı: Bütçe - Mevcut yıl SatışTutarı
    pivot_df['Bütçe Açığı'] = pivot_df['Bütçe'] - pivot_df[f'Satış Tutarı ({current_year})']


      # Stok Açığı/Fazlası
    pivot_df['Stok Açığı/Fazlası'] = pivot_df['Bütçe Açığı'] / (1 + pivot_df['KarOranı'] / 100)- pivot_df['Net Envanter'] 
    

    
    # Yüzde hesaplamaları
    pivot_df['GrupAdı Satış Yüzdesi'] = pivot_df[f'Satış Tutarı ({last_year})'] / pivot_df[f'Satış Tutarı ({last_year})'].sum() * 100
    pivot_df['Kategori Satış Yüzdesi'] = pivot_df.groupby('Kategori')[f'Satış Tutarı ({last_year})'].transform(
        lambda x: (x / x.sum() * 100) if x.sum() != 0 else 0
    )
    
    # Bütçe Gerçekleşme Oranı
    pivot_df['Bütçe Gerçekleşme Oranı'] = (pivot_df[f'Satış Tutarı ({current_year})'] / pivot_df['Bütçe'] * 100).fillna(0)
    
    # Sütun sırası
    new_columns = ['Kategori', 'GrupAdı']
    for month_end in month_end_dates:
        month_label = month_end.strftime("%d.%m.%Y")
        new_columns.append(f"{month_label} KalanTutar")
    new_columns.extend(['Alış Sipariş Tutarı', 'Satış Sipariş Tutarı', f'Satış Tutarı ({last_year})', f'Satış Tutarı ({current_year})', 'KarOranı'
                    , 'Net Envanter'    , 'Bütçe', 'Bütçe Açığı',  'Stok Açığı/Fazlası', 'GrupAdı Satış Yüzdesi', 'Kategori Satış Yüzdesi', 'Bütçe Gerçekleşme Oranı'])
    
    pivot_df = pivot_df[new_columns]
    
    # Alt toplam
    numeric_columns = [col for col in pivot_df.columns if col not in ['Kategori', 'GrupAdı']]
    alt_toplam = pivot_df[numeric_columns].sum(numeric_only=True)
    alt_toplam_row = pd.DataFrame([['TOPLAM', ''] + alt_toplam.tolist()], columns=pivot_df.columns)
    pivot_df = pd.concat([pivot_df, alt_toplam_row], ignore_index=True)
    
    # Türk yerel ayarlarına göre formatlama
    for column in numeric_columns:
        pivot_df[column] = pivot_df[column].astype(float)
        if 'Yüzdesi' in column or 'Oranı' in column:
            pivot_df[column] = pivot_df[column].apply(
                lambda x: f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " %" if pd.notnull(x) else "0,00 %"
            )
        else:
            pivot_df[column] = pivot_df[column].apply(
                lambda x: f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if pd.notnull(x) else "0,00"
            )

else:
    pivot_df = pd.DataFrame()
    logging.warning("Hiçbir ay için veri bulunamadı.")

# HTML e-posta gövdesi (mevcut HTML şablonunu kullanıyorum, sadece yeni sütunları ekliyorum)
# HTML e-posta gövdesi
html_template = """
<html>
<head>
    <style>
        body {{ font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; color: #333; padding: 20px; }}
        h3 {{ color: #2c3e50; border-bottom: 2px solid #2980b9; padding-bottom: 5px; font-size: 18px; }}
        .table-container {{ overflow-x: auto; margin: 20px 0; border: 1px solid #ccc; border-radius: 8px; }}
        .data-table {{ width: 100%; border-collapse: collapse; background-color: #fff; min-width: 800px; }}
        .data-table th {{ background-color: #2980b9; color: #fff; padding: 10px; text-align: left; position: sticky; top: 0; z-index: 2; font-size: 14px; }}
        .data-table td {{ padding: 8px 12px; border: 1px solid #ddd; white-space: nowrap; font-size: 14px; }}
        .data-table td.numeric {{ text-align: right; font-weight: bold; color: #2c3e50; }}
        .data-table td.kar-orani {{ background-color: #e2e3e5; text-align: right; font-weight: bold; color: #383d41; }}
        .data-table th.kar-orani {{ background-color: #6c757d; color: #fff; }}
        .data-table td.butce {{ background-color: #d4edda; text-align: right; font-weight: bold; color: #155724; }}
        .data-table th.butce {{ background-color: #28a745; color: #fff; }}
        .data-table td.hedef-ciro {{ background-color: #d4edda; text-align: right; font-weight: bold; color: #155724; }}
        .data-table th.hedef-ciro {{ background-color: #28a745; color: #fff; }}
        .data-table td.butce-acigi {{ background-color: #f8d7da; text-align: right; font-weight: bold; color: #721c24; }}
        .data-table th.butce-acigi {{ background-color: #dc3545; color: #fff; }}
        .data-table td.butce-acigi-stok {{ background-color: #d1ecf1; text-align: right; font-weight: bold; color: #0c5460; }}
        .data-table th.butce-acigi-stok {{ background-color: #17a2b8; color: #fff; }}
        .data-table tr.alt-toplam {{ background-color: #e9ecef; font-weight: bold; }}
        .data-table tr.alt-toplam td {{ text-align: right; }}
        .footer {{ margin-top: 40px; font-size: 12px; color: #7f8c8d; }}
    </style>
</head>
<body>
<div class="container">
    <p>Merhaba,</p>
    <p>{0} yılı ay bazında stok envanter maliyet raporu ve {1}-{0} ciro dağılımı aşağıda yer almaktadır:</p>
"""

body = html_template.format(current_year, last_year)

# Pivot tabloyu HTML'e çevir
body += f"<h3>Kategori ve GrupAdına Göre Gruplama ({last_year} ve {current_year} Ciro Dağılımı ile)</h3>"
if not pivot_df.empty:
    html_table_df = pivot_df.to_html(index=False, border=0, classes="data-table")
    for col in numeric_columns:
        if col == 'KarOranı':
            html_table_df = html_table_df.replace('<th>KarOranı</th>', '<th class="kar-orani">Kar Oranı</th>')
            for val in pivot_df[col]:
                html_table_df = html_table_df.replace(f"<td>{val}</td>", f'<td class="kar-orani">{val}</td>', 1)
        elif col == 'Bütçe':
            html_table_df = html_table_df.replace('<th>Bütçe</th>', '<th class="butce">Bütçe</th>')
            for val in pivot_df[col]:
                html_table_df = html_table_df.replace(f"<td>{val}</td>", f'<td class="butce">{val}</td>', 1)
        elif col == 'Bütçe Açığı':
            html_table_df = html_table_df.replace('<th>Bütçe Açığı</th>', '<th class="butce-acigi">Bütçe Açığı</th>')
            for val in pivot_df[col]:
                html_table_df = html_table_df.replace(f"<td>{val}</td>", f'<td class="butce-acigi">{val}</td>', 1)
        elif col == 'Bütçe Açığını Kapatmak için Gerekli Stok':
            html_table_df = html_table_df.replace('<th>Bütçe Açığını Kapatmak için Gerekli Stok</th>', '<th class="butce-acigi-stok">Bütçe Açığını Kapatmak için Gerekli Stok</th>')
            for val in pivot_df[col]:
                html_table_df = html_table_df.replace(f"<td>{val}</td>", f'<td class="butce-acigi-stok">{val}</td>', 1)
        else:
            for val in pivot_df[col]:
                html_table_df = html_table_df.replace(f"<td>{val}</td>", f'<td class="numeric">{val}</td>', 1)
    html_table_df = html_table_df.replace('<tr>\n<td>TOPLAM</td>', '<tr class="alt-toplam">\n<td>TOPLAM</td>')
    body += '<div class="table-container">' + html_table_df + '</div>'
else:
    body += "<p>Kategori ve GrupAdı için veri bulunamadı.</p>"

# HTML altbilgisi
body += """
    <p class="footer">İyi çalışmalar,<br>Evdema Ekibi</p>
</div>
</body>
</html>
"""

# E-postayı gönder
with smtplib.SMTP("mail.evdema.com", 587) as server:
    server.login(sender, email_password)
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = "yasincakal@evdema.com"
    msg["Subject"] = f"{current_year} Yılı Envanter Maliyet ve {last_year}-{current_year} Ciro Dağılım Raporu"
    msg.attach(MIMEText(body, "html"))
    
    try:
        server.send_message(msg)
        logging.info(f"✅ E-posta gönderildi: {time.ctime()}")
    except Exception as e:
        logging.error(f"❌ E-posta gönderilemedi: {str(e)}")

# Temizlik
engine.dispose()
