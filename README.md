# Euromillions Groepspot

## Online publiceren

De website gebruikt Supabase voor de opslag van spelers, roosters, betalingen en trekkingen. De frontend kan daarom via GitHub Pages gepubliceerd worden.

De Supabase-tabellen staan in `pool_config`, `payments` en `draws`. De publishable key staat in de frontend; gebruik nooit een secret of `service_role` key in deze bestanden.

## Lokaal testen

```powershell
npm start
```

Open daarna `http://localhost:5500`. De website gebruikt ook lokaal de online Supabase-database.