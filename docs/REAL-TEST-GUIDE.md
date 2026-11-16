# Real test guide for the owner (Windows, VS Code, no real AI model)

Language: plain Hinglish, because this is for the owner's own hands-on test. Commands are for PowerShell in the VS Code terminal (Terminal › New Terminal). Nothing here needs a real model key or a Supabase project.

What this tests: the user panel, the editor, AI mode (with the offline mock Director), the Admin (Owner App) and Claude through the connector (a real Claude on claude.ai, through a tunnel). What it does NOT test: real provider models, real Supabase accounts and emails, real payments, a public address.

## 0. Ek baar ki taiyari

1. **Node**: `node -v`. Project ko Node 20.6 ya naya chahiye; tumhare PC par 20.5.0 hai. nodejs.org se Node 20 ka latest LTS (ya 22 LTS) install karo, VS Code band karke dobara kholo, phir `node -v` check karo.
2. **npm 10+**: `npm -v`. Agar 9.x hai: `npm install -g npm@10`.
3. **Code**: VS Code mein project folder kholo. Terminal mein:
   ```
   git fetch
   git checkout claude/round-c5-admin-content
   git pull
   npm install
   ```
4. **Authenticator app** phone par (Google Authenticator ya Microsoft Authenticator).
5. **cloudflared** (sirf Claude wale test ke liye): `winget install Cloudflare.cloudflared`, phir terminal band karke naya kholo; `cloudflared --version` chalna chahiye.
6. Claude wale test ke liye claude.ai ka aisa plan jisme custom connector jud sakta ho (Settings › Connectors).

## 1. Build (ek baar, kuch minute)

```
npm run build
```

Ye Claude ke export card, guide aur zips bhi banata hai. Code badalne par dobara chalao.

## 2. Teen programs chalao (teen alag terminal)

Teeno ek hi `server-data` folder padhenge. Har terminal mein pehle apne project folder mein ho (`cd` ki zarurat nahi agar VS Code usi folder mein khula hai).

**Terminal 1: server** (credits, projects, Claude ka connector)

```
$env:LOCAL_AUTH_SECRET = "koi-bhi-lamba-random-text-1234567890"
$env:MCP_SECRET = "doosra-lamba-random-text-0987654321"
$env:LOCAL_TOKENS = "1"
$env:SERVER_DATA = "$PWD\server-data"
npm run server
```

Dikhna chahiye: server 127.0.0.1:4400 par chal raha hai.

**Terminal 2: editor, panel, website**

```
$env:VITE_GATEWAY_URL = "http://127.0.0.1:4400"
npm run dev
```

Terminal jo address dikhaye (aam taur par `http://127.0.0.1:5173`) wahi base hai:

- Editor: `<base>/`
- User panel: `<base>/panel/`
- Website: `<base>/site/`

**Terminal 3: Admin (Owner App)**. Pehli baar owner account banao:

```
$env:OWNER_PASSWORD = "apna-pakka-password-yaha"
npm run owner:create -- --email tumhara@email.com
```

Ye ek **2-step secret** print karega. Use authenticator app mein "enter a setup key" se jodo. Phir:

```
$env:SERVER_DATA = "$PWD\server-data"
$env:LOCAL_AUTH_SECRET = "koi-bhi-lamba-random-text-1234567890"
npm run owner
```

Admin: http://127.0.0.1:4300/ (password + app ka 6 ank code). Admin sirf yahin hai; website, panel ya editor mein iska koi link nahi.

## 3. Part A: dummy test (koi asli AI nahi), poora flow

Panel ka Director yahan mock model par chalta hai: jawab ek jaise aate hain. Hum flow dekh rahe hain, quality nahi.

1. Website `<base>/site/` kholo, **Sign up** karo (local mode, asli email nahi jaati). Phir `<base>/panel/` mein login.
2. **Projects › New project**, ek naam do. Project page ke chaaron tab dekho.
3. Project mein **New video** › Director: topic likho. Brief form, phir plan card (scene, cost), **approve**, assets step, build. Har step par dekho kuch toota ya atka to nahi.
4. Video ko **AI mode** mein kholo. Chat list, plan, layers dekho. Mock Director se "scene 2 ka text badlo" jaisa kuch bolo; change dikhe aur ek **Undo** se wapas aaye.
5. Wahi video **Editor** mein kholo: layers, timeline, play, ek text hath se badlo, export karo (Chrome ya Edge mein).
6. Wapas panel: Project ki Style record, memory (Project facts, Video sheet), Asset Library mein us video ke assets.
7. **Admin** (http://127.0.0.1:4300/): reports/ROUND-C5.md ki 11 steps wali script chalao (Website & Brand, Appearance, Features & access). Ek card par apni image lagao aur panel mein turant dikhe ya nahi dekho. Ek user ka feature band karke "Who has this?" dekho.

Har step ka jawab likho: `OK`, `BUG`, `MISSING` ya `CHANGE` + ek line. Aise hi pura session ek saath bhejo (ek ek karke nahi).

## 4. Part B: Claude se video (asli Claude, MCP)

### B1. Tunnel

Naya Terminal 4:

```
cloudflared tunnel --url http://127.0.0.1:4400
```

Ek `https://....trycloudflare.com` address dikhega. Copy karo. Ye address har baar badalta hai.

### B2. Server ko tunnel batao

Terminal 1 band karo (Ctrl+C) aur dobara chalao, is baar do line aur ke saath (address apna dalo):

```
$env:MCP_PUBLIC_URL = "https://XXXX.trycloudflare.com"
$env:MCP_PANEL_URL = "http://127.0.0.1:5173"
$env:LOCAL_AUTH_SECRET = "koi-bhi-lamba-random-text-1234567890"
$env:MCP_SECRET = "doosra-lamba-random-text-0987654321"
$env:LOCAL_TOKENS = "1"
$env:SERVER_DATA = "$PWD\server-data"
npm run server
```

(`MCP_PANEL_URL` mein wahi base dalo jo Terminal 2 ne dikhaya.) Browser wahi PC ka hona chahiye jahan ye sab chal raha hai.

### B3. Claude mein connector jodo

1. claude.ai › Settings › Connectors › **Add custom connector**. Address: `https://XXXX.trycloudflare.com/mcp`. Connect.
2. Tumhare browser mein panel ka consent page khulega. Login kar lo (ya Sign up), **Allow** dabao.
3. Panel › New project › **Create with your own Claude** par card ab "Connected" dikhna chahiye.

### B4. 15 minute ka seedha check

Naya chat: "Mere connector se start_here chalao aur batao tum kya kya kar sakte ho." Claude ko tools, tumhare credits, modes, Styles dikhane chahiye. Ye na chale to yahin ruko, mujhe Claude ka jawab aur server terminal ke aakhri 20 line bhejo.

### B5. Storywise / Circumference jaisa video

Naye chat mein reference video ya uske frames (screenshots) attach karo, aur likho (apne topic ke saath):

> Ye reference video dekho. Isi tarah ka video mere topic par banao: [topic]. Pehle apne tool se pata karo ki banane ke liye kya kya chahiye, jo kam ho wo mujhse poochho, phir plan aur cost dikhao.

Ye dekhna:

1. Claude pehle `start_here` aur `get_brief_fields` chalaye, aur wahi cheezein maange jo Director ke form mein hoti hain (script, voice, captions, language, length...). Har cheez ke liye option de: tum do, Studio banaye, prompt, library, baad mein.
2. Plan scene-by-scene aur credits ke saath, tumhari "yes" ke baad hi build.
3. Assets step, build, phir **export**: card chat mein video banata hai (tumhare PC par), Play aur Download.
4. Fir chat mein badlav maango: "scene 2 ka title bada karo", "ye graphic dobara banao". Claude `edit_video` use karega.

### B6. Check karo ki Director jaisa hi bana

Panel mein:

1. **Projects**: wahi Project, "Made with Claude" ke saath, Video, aur Project ki **Style record**.
2. **Asset Library**: us Video ke assets aur AI library mein Claude ke graphics.
3. Video ko **AI mode** mein kholo: chat list mein Claude ke steps, aur Director wahin se aage badh sake.
4. **Editor** mein kholo: wahi layers; ek layer hath se badlo, Undo karo.
5. Claude se kuch aur badlwao, phir editor refresh karo: badlav dikhe.
6. Panel mein usi Project mein **New video** (Director se, mock) banao: Style aur memory yaad ho.

### B7. Style banana (jab video theek bane)

Steps docs/STYLES-BUILDER.md mein hain: Admin › Readymade Styles › My user account (apni email) › Make a Style from a Project › Draft › Edit › Test › Publish. Pehle sirf video wala test karo, Style ka kaam hum alag se karenge.

## 5. Kuch toote to

- Screenshot lo, aur browser console (F12 › Console) ka laal text.
- Server ke terminal ke aakhri 20 line.
- Claude ka poora jawab (agar Claude galat tool chalaye ya ruk jaye).
- Phir sab bugs ek saath bhejo: `BUG <step> <ek line> / Expected / Actual`.

## 6. Supabase (baad mein, alag round)

Abhi Supabase mat lagao: uska migration kabhi asli Supabase par chala nahi hai, aur local mode se saara flow pehle saaf dikhta hai. Jab Part A aur B theek ho, hum alag, step by step Supabase jodenge (tumhara account hai, bas keys chahiye hongi, aur wo tum hi dalo).

## 7. Band karna

Har terminal mein Ctrl+C. `server-data` aur `owner-data` folder tumhara test data hai, git mein nahi jaata. Naya saaf test chahiye to dono folders delete kar do (VS Code mein hi).
