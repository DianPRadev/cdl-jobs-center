# CDL Jobs Center

A job board platform connecting CDL drivers with trucking companies across the United States, featuring AI-powered driver-job matching.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Data Fetching:** @tanstack/react-query
- **Payments:** Stripe (subscriptions)
- **Email:** Brevo (transactional notifications)
- **AI Matching:** HuggingFace Inference API (semantic embeddings)
- **Error Tracking:** Sentry
- **Hosting:** Vercel

## Features

- Driver registration and profile management
- Company job posting and applicant pipeline (drag-and-drop)
- AI-powered driver-job matching with score breakdowns
- Subscription plans for companies (Starter, Growth, Unlimited)
- Real-time notifications (in-app + email)
- Driver verification system
- Company directory and driver directory
- Admin dashboard

## Local Development

```sh
git clone https://github.com/DianPRadev/cdl-jobs-center.git
cd cdl-jobs-center
npm install
npm run dev
```

Requires a `.env.local` file with:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Deployment

Deployed on Vercel with automatic builds from the `main` branch. Database and edge functions hosted on Supabase.
