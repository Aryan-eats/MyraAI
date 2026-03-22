# Myra AI 

Myra AI is a powerful, plug-and-play AI customer support platform designed for modern websites. It allows businesses to integrate an intelligent chatbot in minutes, providing 24/7 instant support using their own business knowledge.

##  Features

- **Plug & Play**: Add the chatbot to any website with a single script tag.
- **Admin Controlled**: Full control over what the AI knows and how it responds.
- **Always Online**: Instant answers for your customers 24/7.
- **Customizable Knowledge**: Train the AI with your business-specific information.
- **Enterprise SSO**: Secure authentication via Scalekit (SAML/SSO).
- **Responsive Design**: Modern UI built with Tailwind CSS 4 and Motion animations.

##  Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **AI Engine**: [Google Gemini AI](https://ai.google.dev/) (`gemini-2.0-flash`)
- **Authentication**: [Scalekit](https://www.scalekit.com/) (Enterprise SSO/SAML)
- **Database**: [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Motion](https://motion.dev/)

##  Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance
- Google Gemini API Key
- Scalekit API Key and Configuration

### Environment Variables

Create a `.env.local` file in the root directory and add the following:

```env
# Database
MONGODB_URI=your_mongodb_uri

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Scalekit (Authentication)
SCALEKIT_BASE_URL=your_scalekit_base_url
SCALEKIT_CLIENT_ID=your_scalekit_client_id
SCALEKIT_CLIENT_SECRET=your_scalekit_client_secret
SCALEKIT_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

### Installation

```bash
npm install
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the outcome.

## 📂 Project Structure

- `src/app`: Application routes and API endpoints.
  - `src/app/dashboard`: Admin dashboard for managing bot settings.
  - `src/app/embed`: The embeddable chat widget interface.
  - `src/app/api`: Backend APIs (Chat, Auth, Settings).
- `src/components`: Reusable UI components (Home, Dashboard, Chat).
- `src/lib`: Utility functions and library initializations (DB, Scalekit).
- `src/model`: MongoDB data models.

## 📄 License

This project is private and proprietary.
