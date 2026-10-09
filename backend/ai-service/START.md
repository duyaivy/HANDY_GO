1. Tạo máy ảo
    python -m venv .venv (D:\PYCHARM\python.exe -m venv .venv)
2. Chạy máy ảo
    .venv\Scripts\activate
3. Tải thư viện
    pip install -r requirements.txt
4. Start 
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
5. Mở swagger
    http://127.0.0.1:8000/docs