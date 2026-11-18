# MediAssist

Hospital website: patient registration and dashboard, doctors and departments, appointment booking, prescription upload read by Google Gemini with pharmacy staff review, an AI Hospital Concierge chat, journey tracking, reminders and demo payments.

Built with React (Vite), Node.js + Express, MongoDB Atlas and Google Gemini.

**Full explanation, file map, viva questions and demo script: [MediAssist_Student_Guide.pdf](MediAssist_Student_Guide.pdf)**

## Run it

You need Node.js 22 or newer, a MongoDB Atlas database and a Gemini API key.

```
cd server
npm install
```

Copy `server/.env.example` to `server/.env` and fill it in (database link, JWT secret, Gemini key). Never commit `.env`.

```
npm run build     # builds the React website
npm run seed      # only on an empty database: staff account, departments, doctors
npm start
```

Open http://localhost:3001

## Folders

| Folder | What it is |
|---|---|
| `server/` | Express API, MongoDB models, Gemini, reminders, tests (`npm test`), Postman collection |
| `client/` | React website (patient pages and staff dashboard) |
| `public/` | Shared CSS, logo, and the XML hospital directory page (`hospital.html`) |
