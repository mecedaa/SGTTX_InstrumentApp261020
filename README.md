# Instrument table: Singapore, 20 October 2026

Virtual version of the instrument cards for the AI crisis diplomacy tabletop exercise at LKYSPP. It is adapted from the UNGA playtest app. The card library is the 15-card SG Oct 20 Instrument Deck from Airtable, using the SG columns.

- **Table view** at `/`. Participants join on their own laptop or phone with the exercise code and their table (Bird or Flower). Everyone at a table sees the same cards and the same choices.
- **Adjudicator console** at `/admin`. Password protected. From here you run the exercise, release readouts and hindsight cards, and edit the cards.

No external packages are needed. The server is a single Node file.

## How a session runs

1. Log in at `/admin` and create an exercise with a code, for example `sg-dryrun`.
2. Copy the Bird and Flower links from the console and send them to each table. Until you start, participants see a waiting screen.
3. **Start round 1.** Tables place cards in Activate, Deprioritise or Future interest. Their choices appear live in the console.
4. **Close round 1.** Choices lock and the console prepares the round 1 readouts. You can read and edit them in the console. The tables do not see them yet.
5. **Open round 2.** The round 1 readout cards now appear on each table's screen, with the Economic and Political gauges. Expanded cards appear for instruments a table activated in round 1.
6. **Close round 2**, then **Open round 3.** The round 2 readout cards appear on the tables' screens. Round 3 has no instrument choices.
7. **Release hindsight cards** when you are ready. Each table gets a hindsight card for every instrument it activated.
8. **End exercise.**

**Present round N readouts** shows both tables' readouts full screen, for a shared screen in the room.

## What the tables see

- The 15 cards stay in a fixed grid in Print No. order. Cards cannot be dragged around the table, so there is nothing to tidy or reset. A card placed in a pile leaves an empty slot showing which pile it is in.
- On a laptop, drag a card onto a pile or click it and choose. On a phone or tablet, tap a card and choose. On a phone, tap a pile at the bottom of the screen to see what is in it.
- When anyone at the table moves a card into or out of a pile, everyone at that table sees it straight away.
- **Results** (top right) opens the readout cards, the hindsight cards once released, and the other table's choices if that is switched on. The drawer opens by itself when new readouts or hindsight cards arrive.
- The tables never see the "Value in play" label or the running gauge totals.
- After the last choice round (round 3, or when the exercise ends), the card grid is replaced by a summary of what the table played in each round: activated, expanded, deprioritised and future interest. On a laptop the readout and hindsight cards stay open beside the summary. On a phone, they open from Results. Tapping any instrument in the summary opens its card, with the readout it produced and its hindsight card once released.

## Rules the app enforces

- Activate holds up to three instruments. An Expanded card does not take a second slot.
- Deprioritise takes three per round. Cards deprioritised in an earlier round stay in the pile and can only come back by being activated.
- Future interest holds up to three.
- An Expanded card is only playable if the table activated that instrument in an earlier round.

## Readouts and gauges

When you close a round, each table gets one readout card for each instrument it activated or expanded that round. An instrument activated in round 1 or round 2 gets the round 1 readout. Its Expanded card gets the round 2 readout. An instrument that stays in Activate without being expanded gets no new readout.

Each readout card shows the Economic and Political gauges for that readout (-2 to +2). The console shows each table's running total as a number with no upper or lower limit: the sum of the gauges on all its readouts, with a breakdown by round. Edits you make to a readout in the console apply to that exercise only. To change the text for future exercises, edit the card.

## Settings and tools (in the console)

- **Other table:** lets each table see what the other table placed in each pile, once that round has closed. Off by default. Leave it off if only one table is playing.
- **Rounds with instrument choices:** rounds 1 and 2 by default.
- Download the move log (CSV), reset a table, delete the exercise.

## Editing cards

Open **Cards** in the console. Each card has a title, Print No., categories, the designer-only value label, the Activate and Expanded action text, readouts and gauges for each, and the hindsight note. Saved changes appear in running exercises immediately.

Use **Backup and restore > Download library** after editing. **Upload library** replaces the whole library from a downloaded file. **Restore the SG Oct 20 set** brings back the 15 cards as read from Airtable on 12 October 2026.

## Run it on your own computer

Requires Node 18 or later.

```
ADMIN_PASSWORD=choose-a-password node server.js
```

Then open http://localhost:3000 for the table view and http://localhost:3000/admin for the console.

## Deploy on Render

1. In Render, choose **New > Web Service** and connect the GitHub repository `mecedaa/SGTTX_InstrumentApp261020`.
2. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `node server.js`
   - Health check path: `/healthz`
3. Under **Environment**, add `ADMIN_PASSWORD` with the password you want for the console. Without it the password is `change-me`.
4. Click **Create Web Service**. When the deploy finishes, Render gives you a URL. The console is at that URL plus `/admin`.

To update later, push changes to GitHub. Render redeploys automatically.

## Saving data: read this before the session

The app saves exercises and the card library to a file on the server.

- **Free plan.** The service goes to sleep after about 15 minutes without visitors and takes up to a minute to wake. Each sleep, restart or redeploy wipes the saved file, so card edits and exercise records are lost. On the free plan: open the site a few minutes before the session, keep the console open during it, and download the move log and the card library at the end. The card library always comes back as the SG Oct 20 set after a restart.
- **Keeping data (recommended for 20 October).** Upgrade the service to a paid instance (Starter), add a **Disk** under the service's settings with mount path `/var/data`, and add the environment variable `DATA_DIR=/var/data`. Data then survives sleeps, restarts and redeploys.

## Files

```
server.js          the server: API, rules, readouts, live updates, saving
seed-cards.json    the 15 SG Oct 20 cards (used on first start and by "Restore the SG Oct 20 set")
public/index.html  table view (Bird and Flower)
public/admin.html  adjudicator console
public/cards.js    card, readout, hindsight and gauge rendering shared by both views
public/cards.css   card colours and layout
render.yaml        optional Render blueprint
```
