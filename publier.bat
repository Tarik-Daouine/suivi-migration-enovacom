@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Publication de la mise a jour du dashboard Enovacom
echo ============================================================
echo.

git add data.json

git diff --cached --quiet
if %errorlevel%==0 (
  echo Rien a publier : data.json n'a pas change depuis le dernier push.
  echo.
  pause
  exit /b 0
)

git commit -m "MAJ avancement migration - %date% %time%"
if errorlevel 1 (
  echo.
  echo [ERREUR] Le commit a echoue. Voir le message ci-dessus.
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo.
  echo [ERREUR] Le push a echoue. Verifie ta connexion / ton authentification GitHub.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   Termine ! Le client verra la mise a jour dans ~1 minute.
echo   https://tarik-daouine.github.io/suivi-migration-enovacom/
echo ============================================================
echo.
pause
