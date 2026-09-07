@echo off
echo Starting SmartPYQ...
echo.

REM Set AI provider env vars (use your own keys)
REM set OPENAI_API_KEY=your_key_here
REM set OPENAI_BASE_URL=https://openrouter.ai/api/v1
REM set OPENAI_MODEL=openai/gpt-4o-mini
REM set GEMINI_API_KEY=your_key_here

echo Starting backend on http://localhost:8000...
start "SmartPYQ Backend" python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

timeout /t 3 /nobreak >nul

echo Starting frontend on http://localhost:5173...
cd smartpyq-frontend
start "SmartPYQ Frontend" npm run dev

echo.
echo Both servers started!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo.
echo Press any key to stop both servers...
pause >nul

taskkill /FI "WINDOWTITLE eq SmartPYQ Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SmartPYQ Frontend" /F >nul 2>&1
echo Servers stopped.
