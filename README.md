# MeetingBot 🐶


<img width="1902" height="868" alt="image" src="https://github.com/user-attachments/assets/d1c53936-7948-4169-9d0d-2fde0cf736ea" />


MeetingBot is a comprehensive open-source **meeting intelligence platform** that automatically joins your video calls on **Zoom**, **Google Meet**, and **Microsoft Teams** to provide AI-powered **transcriptions, summaries, and actionable insights**. This project demonstrates how to build a SaaS platform with advanced AI integrations using **Gemini** and **Pinecone** for conversational meeting intelligence.

---

## Overview

MeetingBot allows real-time calendar sync to automatically schedule bots for upcoming meetings while giving you full control over which meetings to record. Users can chat with individual meetings or query across their entire meeting history.  

Additional features include:  
- Slack bot integration (built from scratch)  
- Project management tool synchronization (**Jira**)  
- Custom bot personalization  
- Automated action item detection  

We leverage **Next.js 15**, **TypeScript**, **Tailwind CSS 4**, **Shadcn UI**, **NextAuth**, **Prisma ORM**, **Supabase Storage**, **Inngest**, **Gemini API**, **Pinecone**, **Slack Bolt framework**, and more to provide a complete alternative to commercial solutions like Fireflies.ai and Otter.ai.

---

## Features

- 🤖 Automatic AI bot deployment to Zoom, Google Meet, and Microsoft Teams  
- 📝 Meeting transcription with speaker identification and diarization  
- 🧠 AI-generated meeting summaries and action items using **Gemini**  
- 📅 Real-time calendar sync with **Google Calendar**  
- 💬 Chat with meeting conversational AI via RAG pipeline powered by Pinecone vector database  
- 🔍 Semantic search across all meeting transcripts and summaries  
- 🗄️ Meeting embeddings maintained using **Gemini `text-embedding-004`**  
- 🔗 One-click action item sync to **Jira**  
- 🔒 Secure user authentication and session management with **NextAuth**  
- 🎨 Modern responsive UI built with Next.js 15, Tailwind CSS 4, and Shadcn UI  
- 📊 Comprehensive meeting dashboard with audio playback using React H5 Audio Player  
- 📋 Complete meeting history with clickable past meeting navigation  
- 📅 Upcoming meetings dashboard with toggle controls for bot attendance  
- 💭 Individual meeting chat interface for meeting-specific conversations  
- 🗨️ Global chat feature to query across all meetings simultaneously  
- ⚙️ React Context hooks for efficient state management across components  
- ☁️ Inngest functions for automated bot scheduling and background tasks  
- 🛡️ Enterprise-grade security with proper webhook validation using Svix  
- 🗄️ Supabase storage for audio files and user profile images  
- 🎯 Custom bot personalization with name changes and profile image uploads  
- 📧 Post-meeting automated email notifications using Resend integration  
- 🗄️ Efficient database management with Prisma ORM  
- 🔔 Real-time notifications using Sonner toast system  
- 🌙 Dark theme support using Next Themes  

---

## Technologies & Frameworks

- **Frontend & UI**: Next.js 15, TypeScript, Tailwind CSS 4, Shadcn UI, React H5 Audio Player, Sonner, Next Themes  
- **Authentication & Security**: NextAuth, Svix webhook validation  
- **Backend & Database**: Prisma ORM, PostgreSQL, Inngest, Supabase Storage  
- **AI & Data**: Gemini API (`text-embedding-004` for embeddings), Pinecone Vector Database  
- **Integrations**: Google Calendar, Jira, Slack Bolt Framework, Resend  
- **State Management & Querying**: React Context hooks, @tanstack/react-query  

---

## Getting Started

### Prerequisites

- Node.js >= 20  
- PostgreSQL  
- Supabase account (for storage)  
- Gemini API key  
- Pinecone API key  
