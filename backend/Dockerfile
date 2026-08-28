FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    RESET_DATABASE_ON_STARTUP=false

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .
RUN mkdir -p /app/instance/uploads && chmod +x /app/start-backend.sh && chown -R app:app /app

USER app
EXPOSE 5000

CMD ["./start-backend.sh"]
