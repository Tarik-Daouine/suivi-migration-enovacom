@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Lancement de l'editeur Enovacom (avec sauvegarde directe)
echo ============================================================
echo.
echo Une fenetre serveur va s'ouvrir : NE LA FERME PAS pendant l'edition.
echo Le navigateur s'ouvre tout seul sur l'editeur.
echo.

REM Demarre le bon serveur (serve.py) dans sa propre fenetre
start "Serveur Editeur Enovacom - NE PAS FERMER" cmd /k python serve.py

REM Laisse le serveur demarrer puis ouvre l'editeur dans le navigateur
timeout /t 2 /nobreak >nul
start "" http://localhost:8080/editor.html

exit
