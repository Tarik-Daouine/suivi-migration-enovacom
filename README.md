# MIGRATION - ENOVACOM : PREMIER WEEK-END — Dashboard de suivi

Dashboard web **statique** et **en lecture seule** pour suivre la migration finale
Enovacom vers la **Production** pendant le premier week-end de MEP.

- Le **client** consulte le site (aucune modification possible).
- **Tarik** met à jour l'avancement via l'**éditeur local** (`editor.html`), jamais en éditant le JSON à la main.
- Une seule source de données : **`data.json`**.

---

## 📁 Contenu du dossier

| Fichier | Rôle | Publié au client ? |
|---|---|---|
| `index.html` | Dashboard public (runbook, KPIs, tables, automatismes) | ✅ Oui |
| `styles.css` | Design (D.A. Enovacom) | ✅ Oui |
| `app.js` | Chargement de `data.json`, calculs, accordéons, panneau détail | ✅ Oui |
| `data.json` | **Source unique** des données (phases, tables, automatismes…) | ✅ Oui |
| `assets/enovacom-logo.svg` | Logo | ✅ Oui |
| `editor.html` + `editor.js` | **Éditeur local** pour mettre à jour `data.json` | ❌ **Non — usage interne** |
| `README.md` | Ce fichier | (peu importe) |

> ⚠️ `editor.html` / `editor.js` ne sont **pas nécessaires** au client. Tu peux les pousser
> sur GitHub (l'URL n'est pas devinable) ou les garder uniquement en local. Ils ne donnent
> **aucun** accès en écriture au site : ils ne font que **générer** un nouveau `data.json`.

---

## 🔄 Mettre à jour l'avancement (procédure Tarik)

1. **Ouvre l'éditeur** : double-clique sur `editor.html`
   *(ou via un petit serveur local, voir plus bas — recommandé pour le bouton « Charger depuis le serveur »).*
2. **Charge les données** :
   - bouton **« Charger depuis le serveur »** si tu es en local-server, **ou**
   - bouton **« Charger data.json »** pour ouvrir le fichier manuellement.
3. **Ajuste** :
   - les **statuts** (menus déroulants) des phases, solutions, tables et automatismes ;
   - les **pourcentages** des phases (curseurs 0–100) ;
   - les **commentaires** si besoin ;
   - la **date de dernière mise à jour** (champ en haut).
4. Clique **« ⚡ Générer le JSON »**.
5. **Récupère le résultat** :
   - **« ⬇ Télécharger data.json »** (remplace le fichier du dossier), **ou**
   - **« 📋 Copier »** puis colle dans `data.json`.
6. **Publie** (voir Déploiement) → le client voit la mise à jour.

### Statuts autorisés (ne pas en inventer d'autres)

| Objet | Statuts |
|---|---|
| Workflow / phases | `a_faire` · `en_cours` · `termine` · `bloque` |
| Tables | `a_faire` · `en_cours` · `migre` · `ecart` |
| Automatismes | `a_faire` · `en_cours` · `execute` · `bloque` |
| Tests (checks) | `a_faire` · `en_cours` · `ok` · `ko` |

> `migre` = import terminé sans écart bloquant · `ecart` = volume différent / anomalie · `execute` = flux lancé et terminé.

---

## 🚀 Déploiement sur GitHub Pages

### Première mise en ligne

1. Crée un repo GitHub (ex. `suivi-migration-enovacom`).
2. Place **tout le contenu de ce dossier à la racine du repo** (`index.html` doit être à la racine).
3. Pousse les fichiers :
   ```bash
   git init
   git add .
   git commit -m "Dashboard migration Enovacom"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/suivi-migration-enovacom.git
   git push -u origin main
   ```
4. Sur GitHub : **Settings → Pages → Build and deployment**
   - Source : **Deploy from a branch**
   - Branch : **main** / dossier **/(root)** → **Save**.
5. Au bout d'une minute, l'URL publique apparaît :
   `https://<ton-compte>.github.io/suivi-migration-enovacom/`
6. **Envoie cette URL au client.** Il consulte, il ne modifie rien.

### Mises à jour suivantes

Après avoir régénéré `data.json` avec l'éditeur :

```bash
git add data.json
git commit -m "MAJ avancement migration"
git push
```

GitHub Pages republie automatiquement en ~1 minute. Chaque commit te donne en plus
un **historique daté** de ton avancement.

---

## 🖥️ Tester en local

Les navigateurs bloquent `fetch("data.json")` en `file://`. Pour tester localement,
lance un petit serveur depuis ce dossier :

```bash
# Python (déjà installé)
python -m http.server 8080
```

Puis ouvre :
- Dashboard : <http://localhost:8080/index.html>
- Éditeur : <http://localhost:8080/editor.html>

---

## 🧮 Ce que le dashboard calcule (automatique, jamais en dur)

- **Progression globale** = moyenne entre l'avancement du runbook et celui des tables.
- **Tables au total / migrées / avec écart** (écart = `gap` ≠ 0 ou statut `ecart`).
- **Automatismes exécutés / total**.
- **Points bloquants ouverts** (phases bloquées + automatismes bloqués + tests KO).
- **État global du runbook** déduit des statuts des étapes.

Tous ces chiffres proviennent **exclusivement** de `data.json`.

---

## 📝 Notes

- Les **volumes et écarts** proviennent des captures OneNote (comparaison OnPrem / D365).
- L'**ordre des phases** et l'**ordre opérationnel des tables** suivent le schéma SSIS KingswaySoft.
- Les **champs vides restent vides** quand l'information n'est pas disponible — ne pas inventer de valeurs.
- Le suivi concerne **la Production uniquement** (la Sandbox n'apparaît que pour l'étape d'export des solutions).
