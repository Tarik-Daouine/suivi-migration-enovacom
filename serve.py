#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini-serveur LOCAL pour l'éditeur du dashboard Enovacom (usage interne).
- Sert les fichiers du dossier (index.html, editor.html, data.json, ...).
- Accepte POST /save pour écrire directement dans data.json (bouton Sauvegarder).

Lancer :  python serve.py            (port 8080 par défaut)
          python serve.py 8090       (autre port)
Puis ouvrir :  http://localhost:8080/editor.html
NE PAS déployer ce fichier : il est réservé à l'édition locale.
"""
import http.server
import os
import sys
import json
import subprocess
import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIRECTORY, "data.json")


def git_info():
    """Infos de publication : SHA court, date du commit, sujet, etat pousse/modifie."""
    def out(args):
        try:
            r = subprocess.run(args, cwd=DIRECTORY, capture_output=True, text=True, encoding="utf-8")
            return r.stdout.strip() if r.returncode == 0 else ""
        except Exception:
            return ""
    head = out(["git", "rev-parse", "HEAD"])
    origin = out(["git", "rev-parse", "origin/main"])
    # data.json a-t-il des modifs non committées ?
    try:
        dirty = subprocess.run(["git", "diff", "--quiet", "data.json"], cwd=DIRECTORY).returncode != 0
    except Exception:
        dirty = False
    return {
        "sha": out(["git", "rev-parse", "--short", "HEAD"]),
        "date": out(["git", "show", "-s", "--format=%cd", "--date=format:%Y-%m-%d %H:%M", "HEAD"]),
        "subject": out(["git", "show", "-s", "--format=%s", "HEAD"]),
        "pushed": bool(head) and head == origin,
        "dirty": dirty,
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0].rstrip("/") == "/status":
            self._json(200, git_info())
            return
        super().do_GET()

    def do_POST(self):
        route = self.path.rstrip("/")
        if route == "/save":
            self.handle_save()
        elif route == "/publish":
            self.handle_publish()
        else:
            self._json(404, {"ok": False, "error": "Route inconnue."})

    def handle_save(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8")
            data = json.loads(raw)  # validation : on refuse d'écrire un JSON cassé
        except Exception as e:
            self._json(400, {"ok": False, "error": "JSON invalide : " + str(e)})
            return
        try:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write("\n")
        except Exception as e:
            self._json(500, {"ok": False, "error": "Écriture impossible : " + str(e)})
            return
        self._json(200, {"ok": True})

    def handle_publish(self):
        # Consomme le corps éventuel (non utilisé) pour ne pas casser la connexion.
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length:
                self.rfile.read(length)
        except Exception:
            pass

        def run(args):
            return subprocess.run(
                args, cwd=DIRECTORY, capture_output=True, text=True, encoding="utf-8"
            )

        try:
            # 1) stage data.json
            run(["git", "add", "data.json"])
            # 2) y a-t-il quelque chose à committer ?
            staged = run(["git", "diff", "--cached", "--quiet"])
            if staged.returncode == 0:
                self._json(200, {"ok": True, "nothing": True,
                                 "message": "Rien à publier : data.json n'a pas changé depuis le dernier push."})
                return
            # 3) commit
            stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            commit = run(["git", "commit", "-m", "MAJ avancement migration - " + stamp])
            if commit.returncode != 0:
                self._json(500, {"ok": False, "error": "Echec du commit",
                                 "detail": (commit.stdout + commit.stderr).strip()})
                return
            # 4) push
            push = run(["git", "push", "origin", "main"])
            if push.returncode != 0:
                self._json(500, {"ok": False, "error": "Echec du push (auth GitHub ?)",
                                 "detail": (push.stdout + push.stderr).strip()})
                return
            info = git_info()
            self._json(200, {"ok": True, "message": "Publié sur GitHub avec succès.",
                             "sha": info.get("sha"), "date": info.get("date")})
        except FileNotFoundError:
            self._json(500, {"ok": False, "error": "Git introuvable. Vérifie que Git est installé et dans le PATH."})
        except Exception as e:
            self._json(500, {"ok": False, "error": "Erreur publication : " + str(e)})

    def end_headers(self):
        # Jamais de cache : on voit toujours la dernière version pendant l'édition.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silencieux


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:
        httpd = http.server.ThreadingHTTPServer(("", PORT), Handler)
    except OSError as e:
        print("=" * 60)
        print("  [ERREUR] Impossible de demarrer sur le port %d." % PORT)
        print("  Un autre serveur l'utilise deja (ex: 'python -m http.server').")
        print("  -> Ferme l'autre fenetre serveur, ou lance : python serve.py 8090")
        print("  Detail : %s" % e)
        print("=" * 60)
        input("Appuie sur Entree pour fermer...")
        sys.exit(1)
    with httpd:
        print("=" * 60)
        print("  Editeur Enovacom -- serveur local demarre (sauvegarde ACTIVE)")
        print("  Editeur : http://localhost:%d/editor.html" % PORT)
        print("  Dashboard : http://localhost:%d/index.html" % PORT)
        print("  (Ctrl+C pour arreter)")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrete.")
