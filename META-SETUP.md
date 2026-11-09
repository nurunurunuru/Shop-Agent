# Meta App সেটআপ (আপনি একবার করবেন — দোকানদারদের কিছু করতে হবে না)

aipraktor-এর মতো "বাটন চেপে কানেক্ট" কাজ করে কারণ **একটাই Meta App** সব দোকানদারের হয়ে কাজ করে।
দোকানদার শুধু ওই App-এ লগইন করে অনুমতি দেয়। তাই Meta-র ঝামেলা (App Review, Business Verification) আপনার একবারের কাজ।

## ধাপ ১ — Meta App বানান
1. developers.facebook.com → My Apps → Create App → **Business** টাইপ।
2. Settings → Basic থেকে **App ID** ও **App Secret** নিয়ে `.env`-এ `META_APP_ID`, `META_APP_SECRET` দিন।
3. Settings → Basic: **Privacy Policy URL** = `https://<আপনার-ডোমেইন>/privacy-policy.html`।
   **Data Deletion Request URL** = `https://<আপনার-ডোমেইন>/meta/data-deletion`।
4. Facebook Login (for Business) → Settings: **Deauthorize Callback URL** = `https://<আপনার-ডোমেইন>/meta/deauth`;
   **Allowed Domains for the JavaScript SDK** ও **Valid OAuth Redirect URIs**-এ `https://<আপনার-ডোমেইন>` দিন। (শুধু https চলে।)

## ধাপ ২ — Webhook (একবারই)
Products → Messenger / Instagram / WhatsApp যোগ করে প্রতিটার Webhooks-এ:
- Callback URL: `https://<আপনার-ডোমেইন>/webhook`
- Verify token: `.env`-এর `VERIFY_TOKEN`-এর মান
- **Page** অবজেক্টে সাবস্ক্রাইব: `messages`, `messaging_postbacks`, `feed`
- **Instagram** অবজেক্টে: `messages`, `messaging_postbacks`, `comments`
- **WhatsApp Business Account** অবজেক্টে: `messages`

(প্রতিটা দোকানের পেজ কানেক্ট করার সময় সার্ভার নিজে ওই পেজকে সাবস্ক্রাইব করে নেয়, ওটা আর হাতে করতে হয় না।)

## ধাপ ৩ — Facebook পেজ + Instagram-এর কানেক্ট বাটন
1. Facebook Login for Business → **Configurations** → Create: টাইপ **User access token**, অ্যাসেট: **Pages** (ও Instagram)।
2. অনুমতি (permissions) বাছুন: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `business_management`।
3. কনফিগারেশনের **Configuration ID** → `.env`-এর `META_FB_CONFIG_ID`।
   (না দিলেও চলে: তখন সরাসরি ওপরের অনুমতিগুলো scope হিসেবে চাওয়া হয়।)

## ধাপ ৪ — WhatsApp-এর কানেক্ট বাটন (Embedded Signup)
1. WhatsApp Embedded Signup-এর জন্য Meta-র **Tech Provider** হতে হয় (Business Verification সহ)। Meta-র নিয়ম বদলায়, তাই developers.facebook.com-এর "WhatsApp → Embedded Signup" গাইড দেখে নিন।
2. Facebook Login for Business → Configurations → **WhatsApp Embedded Signup** টেমপ্লেট থেকে কনফিগারেশন বানান।
3. তার ID → `META_WA_CONFIG_ID`। Solution ID থাকলে `META_WA_SOLUTION_ID`।

## ধাপ ৫ — App Review (অন্য দোকানদারদের জন্য লাইভ করতে)
- **Development মোডে** শুধু আপনার App-এর Admin/Developer/Tester রোলের লোকেরা কানেক্ট করতে পারবে — নিজের পেজ দিয়ে পুরো সিস্টেম এখনই টেস্ট করতে পারবেন।
- সাধারণ মানুষের জন্য: App-কে **Live** করুন + **Business Verification** + ওপরের অনুমতিগুলোর জন্য **App Review** (screencast সহ)। ছবি/ভিডিও দেখাতে হবে: দোকানদার কানেক্ট করছে → কাস্টমার মেসেজ করছে → উত্তর যাচ্ছে।
- রিভিউয়ে সময় লাগে, প্রত্যাখ্যানও হতে পারে — প্রথমবারে ঠিক না হলে Meta-র মন্তব্য দেখে আবার জমা দিন।

## টেস্ট করার সহজ ক্রম
1. `.env` সাজান → `npm start` → https URL দিয়ে খুলুন (Render বা ngrok)।
2. অ্যাকাউন্ট খুলুন → **🔗 কানেক্ট** ট্যাব → Facebook বাটন চাপুন → নিজের পেজ টিক দিন।
3. অন্য একটা Facebook অ্যাকাউন্ট থেকে ওই পেজে মেসেজ দিন → ইনবক্সে আসবে।
4. ঠিক থাকলে ⚙ সেটিংস → **AI লাইভ**।
