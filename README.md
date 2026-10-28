# TECH4DEFENCE: appka pro účastníky

Webová aplikace Defence Hubu pro akce TECH4DEFENCE. Každý účastník se přihlásí svým e-mailem z registrace (bez hesla, odkazem do mailu) a vidí:

- **Moje točení**: svou barevnou skupinu (stejná barva jako na jmenovce) a pro každé kolo místnost, stůl zbrojařů a skupiny, se kterými tam sedí. Pod tím celý rozpis.
- **Program** a info o akci (místo, mapa, pořadatelé, kontakt).
- **Profil**: může si upravit jméno, pozici, kontakty, medailonek a důvod účasti. Firmu, e-mail, stav ani skupinu měnit nemůže.
- **Firmy na akci** (volitelné, zapíná admin): medailonky ostatních potvrzených firem.

Admin (tým DH a organizátoři) má navíc **Administraci**:

- **Účastníci**: import exportu z MS Forms (`Formulář zájmu o akci …xlsx`) nebo CSV, potvrzení registrací (jednotlivě i hromadně), typ (civilní firma / zbrojař / organizátor), ruční přiřazení skupiny, **automatické rozdělení do skupin** (vyrovnaný počet, obory rozprostřené), prezence, export CSV.
- **Točení**: barevné skupiny, místnosti (s nápovědou, kde je najdou), kola s časy a mřížka rozpisu. Appka hlídá, že je každá skupina v každém kole právě jednou a ke každému stolu zbrojařů se dostane právě jednou. Strukturu jde zkopírovat z jiné akce.
- **Program**, **Info o akci** (zveřejnění, medailonky), **Jmenovky** k tisku (A4, 8 na stránku, barevný pruh podle skupiny).

Jedna instalace zvládne všechny akce (Pardubice, Olomouc, Zlín…). Kdo je registrovaný na víc akcí, vidí je všechny pod jedním účtem.

Při načítání jede Hubík na koni (`assets/hubik-kun.mp4`, výřez z Canva prezentace „Jdeme na to!“).

## Jak to běží

- **Frontend**: statický web (HTML + JS, bez buildu) na GitHub Pages.
- **Backend**: [Supabase](https://supabase.com) (Postgres + přihlašování magic linkem). Data chrání pravidla Row Level Security přímo v databázi: účastník vidí jen sebe a rozpis svých akcí, cizí e-mail nevidí nic, zapisovat do účastníků smí jen admin.
- Bez vyplněného `config.js` běží appka v **DEMO režimu** (vymyšlená data, nic se neukládá). Přihlášení: `ucastnik@demo.cz` nebo `admin@demo.cz`.

Účastníci se do repozitáře **nikdy** neukládají (repo je veřejné). Importují se jen v administraci a leží v Supabase. `.gitignore` blokuje `*.xlsx` a `*.csv`.

## Spuštění naostro (cca 20 minut)

1. **Supabase projekt**: na supabase.com → New project, region `Central EU (Frankfurt)`.
2. **Databáze**: SQL Editor → vložit a spustit `supabase/schema.sql`, potom `supabase/seed-pardubice.sql`. V seedu jsou admini (doplň další e-maily týmu do tabulky `admins`).
3. **E-maily (nutné)**: vestavěný e-mail Supabase posílá jen členům týmu projektu a s nízkým limitem, na účastníky nestačí. Authentication → Emails → SMTP Settings → zapnout vlastní SMTP (např. firemní Office 365 schránka, Brevo, Resend). Potom Authentication → Rate Limits zvednout limit e-mailů za hodinu podle počtu účastníků.
4. **Šablona e-mailu**: Authentication → Emails → Magic Link, předmět a text česky, např.:
   - Předmět: `Přihlášení do appky TECH4DEFENCE`
   - Text: `<p>Dobrý den,</p><p>pro přihlášení do aplikace TECH4DEFENCE klikněte na odkaz:</p><p><a href="{{ .ConfirmationURL }}">Přihlásit se</a></p><p>Odkaz platí jednu hodinu. Pokud jste o přihlášení nežádali, e-mail ignorujte.</p><p>Tým Defence Hub CzechInvest</p>`
5. **Adresa appky**: Authentication → URL Configuration → Site URL = adresa GitHub Pages (např. `https://nadinensmark-bot.github.io/tech4defence/`), totéž přidat do Redirect URLs.
6. **config.js**: Project Settings → API → zkopírovat `Project URL` a `anon public` key do `config.js` a commitnout. (anon key je veřejný, data chrání RLS. **service_role key nikdy do repa.**)
7. **GitHub Pages** se nasadí samo po pushi do `main` (workflow `.github/workflows/pages.yml`). Kdyby ne: Settings → Pages → Source: GitHub Actions.

## Postup před akcí

1. Administrace → akce → **Účastníci** → nahrát xlsx z Forms.
2. Projít a potvrdit (nebo „Potvrdit všech čekajících“), zbrojařům a organizátorům nastavit typ.
3. **Točení**: zkontrolovat rozpis, doplnit časy kol a kde místnosti najdou.
4. **Rozdělit do skupin**. Ručně jde cokoli přehodit.
5. Poslat účastníkům odkaz na appku (stačí adresa, přihlásí se sami e-mailem z registrace).
6. **Jmenovky** → Tisk (v dialogu zapnout „Grafika pozadí“), na prezenci odškrtávat **Prezenci**.

## Struktura

```
index.html            vstup, načítání s Hubíkem
config.js             Supabase URL + anon key (prázdné = demo)
styles.css            vzhled (paleta a fonty Defence Hubu)
js/app.js             obrazovky účastníka a administrace
js/api.js             datová vrstva: Supabase / demo
js/demo-data.js       ukázková data (vymyšlené firmy)
supabase/schema.sql   tabulky, RLS, funkce
supabase/seed-pardubice.sql  akce Pardubice 11. 11. 2026: program, 6 skupin, 3 místnosti, 3 kola
assets/               loga DH (bílá), Hubík na koni
```
