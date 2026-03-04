# Migration TODO — New Supabase Project (dlhtuqsdooltinqmyrgw)

## DONE
- [x] All SQL migrations run on new project
- [x] All 10 edge functions deployed
- [x] Secrets set: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BREVO_API_KEY, BREVO_SENDER_EMAIL, HF_API_KEY, SITE_URL, ALLOWED_ORIGINS
- [x] Stripe products/prices created (test mode): starter, growth, unlimited
- [x] Stripe webhook created pointing to new project
- [x] Price IDs updated in create-checkout edge function
- [x] app_config updated with new project URL + sb_secret key
- [x] Cron job (match-recompute) fixed to use service_role_key
- [x] .env.local updated with new Supabase URL/keys + Stripe price IDs
- [x] index.html preconnect URL updated
- [x] All old project refs (ivgfgdyfafuqusrdxzij) removed from codebase
- [x] Facebook OAuth configured in Supabase + Meta dashboard
- [x] Vercel env vars added (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, etc.)
- [x] Email notifications fixed (sb_secret key format issue)

## REMAINING

### 1. Supabase Auth URL Configuration
- Go to Supabase > Authentication > URL Configuration
- Site URL: `https://cdl-jobs-center-prod.vercel.app`
- Add redirect URL: `https://cdl-jobs-center-prod.vercel.app/**`

### 2. Google OAuth
- In Google Cloud Console, add callback URL: `https://dlhtuqsdooltinqmyrgw.supabase.co/auth/v1/callback`
- Paste Client ID + Secret into Supabase > Authentication > Providers > Google

### 3. Brevo Domain Verification (emails not delivering)
- Go to Brevo > Settings > Senders, Domains & Dedicated IPs > Domains
- Add `cdljobscenter.com`
- Add the DNS records Brevo provides (DKIM, SPF, DMARC) at domain registrar
- Without this, emails from noreply@cdljobscenter.com will be blocked/spam

### 4. Brevo SMTP for Supabase Auth Emails
- Supabase > Authentication > Email Templates > SMTP Settings
- Host: smtp-relay.brevo.com
- Port: 587
- Username: (from Brevo SMTP settings)
- Password: generate SMTP key in Brevo
- This makes "Confirm your email" and "Reset password" emails work

### 5. DNS — Point cdljobscenter.com to Vercel
- Dian needs to add A record: @ → 216.198.79.1
- Optional CNAME: www → cname.vercel-dns.com
- At whatever registrar the domain was purchased (ask Dian for login)

### 6. Stripe Publishable Key
- .env.local still has old Stripe publishable key (pk_test_51SBZw1...)
- Owner's new key (pk_test_51T76Gk...) should be in Vercel as VITE_STRIPE_PUBLISHABLE_KEY
- Get it from: Stripe Dashboard > Developers > API keys > Publishable key

### 7. Stripe Live Mode (when ready for real payments)
- Create live products/prices in Stripe (same 3 plans)
- Get live secret key (sk_live_...) and update STRIPE_SECRET_KEY secret
- Create live webhook endpoint, update STRIPE_WEBHOOK_SECRET
- Update price IDs in create-checkout edge function + Vercel env vars
- Redeploy edge functions

## Project Details (reference)
- New Supabase ref: dlhtuqsdooltinqmyrgw
- New Supabase URL: https://dlhtuqsdooltinqmyrgw.supabase.co
- Vercel project: cdl-jobs-center-prod
- Vercel URL: https://cdl-jobs-center-prod.vercel.app
- Target domain: cdljobscenter.com
