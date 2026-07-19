# insta-followers-diff

[English](README.md) | **Türkçe**

**Instagram'da takip ettiğin ama seni geri takip etmeyen hesapları bul — tamamen tarayıcında.**

Canlı: https://furkankeremselimoglu.github.io/insta-followers-diff/

![insta-followers-diff — resmi Instagram veri dışa aktarımını bırak ve seni geri takip etmeyenleri gör, tamamen çevrimdışı, tarayıcında](docs/screenshot.png)

## Gizlilik

Tüm işlemler tarayıcında gerçekleşir. **Sıfır ağ isteği.** Verilerin cihazından asla çıkmaz ve uygulama tamamen çevrimdışı çalışır. Bu, katı bir Content Security Policy ile zorunlu kılınır ve her commit'te otomatik CI kontrolleriyle doğrulanır.

## Nasıl Kullanılır

### 1. Instagram Dışa Aktarımını Al

Takipçi ve takip edilen listelerini Instagram'dan indirmek için şu adımları izle:

1. **Instagram'ı aç** → menü simgesine dokun
2. **Hesaplar Merkezi** → **Bilgilerin ve izinlerin** bölümüne git
3. **Bilgilerini indir**'i seç
4. **Bilgileri özelleştir**'i seç
5. **Bağlantılar** altında **yalnızca "Takipçiler ve takip edilenler"** seçeneğini işaretle (diğerlerini atlayabilirsin)
6. Tarih aralığını **"Tüm zamanlar"** olarak ayarla — daha kısa bir aralık takipçi listeni sessizce budar ve sonuçları şişirir
7. **JSON formatını seç** (HTML DEĞİL — aşağıdaki uyarıya bak)
   - **⚠️ Önemli:** HTML, Instagram'ın varsayılan formatıdır ve bu uygulamayla çalışmaz. HTML dosyalar aldıysan geri dön ve JSON formatını seçerek yeniden talep et.
8. Talebi tamamla ve indirme bağlantısını içeren e-postayı bekle (birkaç dakikadan birkaç saate kadar sürebilir)

### 2. Verini insta-followers-diff'e Yükle

Dışa aktarımın hazır olduğunda:

- ZIP dosyasını **sürükleyip bırak**, veya
- Ayıklanmış `connections/followers_and_following/` klasörünü **sürükleyip bırak**, veya
- **Dosya seç** ile JSON dosyalarını elle seç

Uygulama verini ayrıştırır ve sana şunları gösterir:

- **Seni geri takip etmeyenler:** Takip ettiğin ama seni takip etmeyen hesaplar
- **Hayranlar:** Seni takip eden ama senin geri takip etmediğin hesaplar

### 3. Sonuçları İndir

İki sekme arasında geçiş yap ve her grup için listeyi CSV olarak indir (Excel, Google E-Tablolar vb. ile açılır).

Farklı bir dışa aktarım yüklemek için istediğin zaman **"Baştan başla"** düğmesine tıkla.

## SSS

**Bu güvenli mi?**  
Evet. Kendi resmi Instagram dışa aktarım verini kullanıyorsun — giriş yok, yükleme yok, üçüncü taraf yok. Uygulama tamamen çevrimdışı, tarayıcında çalışır.

**Neden JSON yerine HTML aldım?**  
Instagram, dışa aktarım talep ettiğinde varsayılan olarak HTML formatını kullanır. Hesaplar Merkezi'ne geri dön, yeniden talep et ve format seçeneği sunulduğunda açıkça JSON'u seç.

**Zaman damgaları ne anlama geliyor?**  
"Takip tarihi" bilgisi doğrudan Instagram'ın dışa aktarımından gelir. O hesabı ne zaman takip etmeye başladığını gösterir.

**ZIP dosyam devasa. Neden?**  
Muhtemelen yalnızca "Takipçiler ve takip edilenler" yerine **tüm bilgilerini** dışa aktardın. İşlemi hızlandırmak için geri dön ve yalnızca "Takipçiler ve takip edilenler" kategorisini talep et.

**Bazı takipçiler eksik / sayılar çok düşük görünüyor?**  
Dışa aktarımın tarih aralığı **"Tüm zamanlar"** olarak ayarlanmadığında Instagram **takipçi listesinin yalnızca bir bölümünü** döndürür — liste yalnızca seçilen aralıkta seni takip etmeye başlayanları içerir; takip ettiklerin listesi ise eksiksiz gelir. Bu da aşırı şişmiş bir "geri takip etmeyen" sayısı üretir. Uygulama bunu **otomatik olarak algılar** (takipçi geçmişin, takip etme geçmişinden çok sonra başlıyorsa) ve bir uyarı gösterir. Çözüm: tarih aralığını **"Tüm zamanlar"** olarak ayarlayıp dışa aktarımını yeniden talep et. Hızlı bir manuel kontrol — uygulamadaki "Takipçi" sayısı Instagram profilindeki sayıdan düşükse dışa aktarımın eksik demektir.

## Neden Yalnızca Dışa Aktarım?

Bu araç **yalnızca** Instagram'ın resmi veri dışa aktarımıyla çalışır — bu bilinçli bir tercih. Asla giriş yapmaz, asla şifreni istemez ve Instagram'ın özel API'sine asla dokunmaz. Listelerini giriş yaparak çeken üçüncü taraf araçlar (scraper'lar, tarayıcı betikleri, "unfollower" uygulamaları) Instagram'ın Kullanım Koşulları'nı ihlal eder ve hesabının askıya alınması, kısıtlanması veya güvenlik doğrulamasına takılması gibi gerçek riskler taşır. Bu proje yalnızca sıfır riskli yolu izler.

## Geliştirme

### Test

```bash
npm test
```

Node.js testlerini çalıştırır (çekirdek diff mantığı, ayrıştırma, CSV dışa aktarma, ZIP işleme). Harici bağımlılık gerekmez.

### Felsefe

- **Build adımı yok.** Web uygulaması, olduğu gibi sunulan saf HTML + ES modüllerinden oluşur.
- **npm bağımlılığı yok.** Yalnızca Node test çalıştırıcısı; tarayıcı tek bir vendorlanmış ZIP kütüphanesi görür.
- **Framework yok.** Çekirdek mantık bağımsız test edilebilir; tarayıcı ile Node arasında paylaşılır.

Daha fazla ayrıntı için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bak (İngilizce).

## Lisans

MIT — [LICENSE](LICENSE) dosyasına bak
