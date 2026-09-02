# ArrowFlow — Cloud Function ตรวจสอบการซื้อ (verifyPurchase)

ฟังก์ชันนี้ทำหน้าที่ถาม Google Play ว่า purchase token ที่แอปได้รับมา "เป็นของจริง" หรือไม่
โค้ดฝั่งแอปอยู่ที่ [`js/iap.js`](../js/iap.js) (`verifyOnServer` / `reconcilePurchase`)

## ขั้นตอนตั้งค่า (ทำครั้งเดียว ในคอนโซล)

### 1. เปิด Blaze plan ให้ Firebase project `arrowflow-8d6a8`
Cloud Functions ต้องใช้ Blaze (pay-as-you-go) เพราะต้องเรียก network ออกนอก Google
โควตาฟรียังคงมีอยู่ (2 ล้าน invocation/เดือน) — โหลดของเกมนี้จะอยู่ในโควตาฟรีสบายๆ
แต่ **ต้องผูกบัตรเครดิตไว้** ถึงจะ deploy ได้ แนะนำให้ตั้ง budget alert ไว้ที่ $1 กันพลาด

### 2. เปิด Google Play Android Developer API
Google Cloud Console → APIs & Services → เปิดใช้ **Google Play Android Developer API**
(ต้องอยู่ใน project `arrowflow-8d6a8` เดียวกัน)

### 3. ผูก Google Cloud project เข้ากับ Play Console
Play Console → Setup → **API access** → Link existing project → เลือก `arrowflow-8d6a8`

### 4. ให้สิทธิ์ service account ของฟังก์ชัน
ฟังก์ชันรันด้วย service account เริ่มต้นของ project (ไม่มีการเก็บ key file ไว้ที่ไหนเลย)
หาอีเมลของมันได้ที่ Google Cloud Console → IAM (รูปแบบ `arrowflow-8d6a8@appspot.gserviceaccount.com`
หรือ `<project-number>-compute@developer.gserviceaccount.com`)

จากนั้น Play Console → **Users and permissions** → Invite new users → ใส่อีเมลนั้น
→ เลือกแอป ArrowFlow → ให้สิทธิ์ **View financial data, orders, and cancellation survey responses**

> สิทธิ์อาจใช้เวลาถึง ~24 ชม. จึงจะมีผลจริง ถ้าเพิ่ง invite แล้ว deploy เลย
> ฟังก์ชันจะตอบ `unknown` (ไม่ใช่ `invalid`) ซึ่งปลอดภัย — แอปจะเก็บการซื้อไว้แล้วลองใหม่ทีหลัง

### 5. Deploy

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

URL ที่ได้ต้องตรงกับค่า `VERIFY_URL` ใน [`js/iap.js`](../js/iap.js):
`https://us-central1-arrowflow-8d6a8.cloudfunctions.net/verifyPurchase`

## พฤติกรรมที่ตั้งใจไว้

ฟังก์ชันตอบ 3 สถานะ และฝั่งแอปปฏิบัติต่างกันชัดเจน:

| สถานะ | ความหมาย | แอปทำอะไร |
|---|---|---|
| `valid` | Google ยืนยันว่าซื้อจริง และ token นี้ยังไม่เคยถูกบัญชีอื่นใช้ | ล้างออกจากคิว จบ |
| `invalid` | Google ไม่รู้จัก token / ถูกยกเลิก-คืนเงิน / token นี้เป็นของบัญชีอื่น | **ยกเลิกไอเทม** + แจ้งผู้เล่น |
| `unknown` | ฝั่งเราเองมีปัญหา (offline, API ล่ม, ยังไม่ deploy, สิทธิ์ยังไม่มา) | **เก็บไอเทมไว้** แล้วลองใหม่ตอนเปิดแอปครั้งหน้า |

หลักการสำคัญ: **การให้ไอเทมไม่เคยรอผลตรวจสอบ** ผู้เล่นได้ของทันทีที่จ่ายเงินเสร็จเสมอ
การตรวจสอบทำทีหลังแบบ background และจะยึดของคืนก็ต่อเมื่อ Google ปฏิเสธชัดเจนเท่านั้น
ลูกค้าที่จ่ายเงินจริงต้องไม่มีทางเสียของเพราะเน็ตหลุดหรือ backend ล่ม

## ขอบเขต (สิ่งที่ระบบนี้ *ไม่ได้* แก้)

ข้อมูลไอเทมยังเก็บอยู่ใน localStorage ของเครื่องผู้เล่นเหมือนเดิม คนที่แก้ localStorage
ตรงๆ ได้ก็ยังโกงได้อยู่ การอุดช่องนั้นต้องย้ายทั้งระบบเศรษฐกิจไปอยู่ฝั่งเซิร์ฟเวอร์
ซึ่งใหญ่กว่านี้มากและไม่ใช่เป้าหมายของงานชิ้นนี้

สิ่งที่งานชิ้นนี้อุดคือช่องที่ **ง่ายที่สุด** — แอปปลอม Play Store (Lucky Patcher ฯลฯ)
ที่แค่ติดตั้งแล้วกดซื้อก็ได้ของฟรีทันที โดยไม่ต้อง root ไม่ต้องแก้ไฟล์อะไรเลย
