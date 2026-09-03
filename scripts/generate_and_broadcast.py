import base64
import json
import os
import time
import requests
from google import genai
from telegram import Bot

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")
PYTHONANYWHERE_URL = os.getenv("PYTHONANYWHERE_URL")
BROADCAST_SECRET = os.getenv("BROADCAST_SECRET")

bot = Bot(token=TELEGRAM_TOKEN)
client = genai.Client(api_key=GEMINI_API_KEY)


def main():
  prompt = (
      "Создай код HTML5 игры (один файл index.html с CSS и JS внутри) и"
      " новость о ней для Telegram. Верни СТРОГО валидный JSON (без ошибок в кавычках,"
      " экранируй переносы строк внутри кода) со следующими ключами: "
      "'dir_name' (название папки без пробелов, англ), "
      "'html_code' (полный код html), "
      "'game_title' (название игры), "
      "'news_json_entry' (объект для games.json в виде словаря с полями title и url), "
      "'news_text' (короткий вовлекающий текст новости со ссылкой)."
  )

  response = None
  for attempt in range(5):
    try:
      response = client.models.generate_content(
          model="gemini-3.6-flash", contents=prompt
      )
      break
    except Exception as e:
      if "503" in str(e) and attempt < 4:
        print(f"Сервер перегружен (503), попытка {attempt + 1} из 5. Повтор...")
        time.sleep(15)
        continue
      raise e

  raw_text = response.text.strip()
  if "```json" in raw_text:
    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
  elif "```" in raw_text:
    raw_text = raw_text.split("```")[1].split("```")[0].strip()

  try:
    data = json.loads(raw_text)
  except json.JSONDecodeError as e:
    print(f"Ошибка парсинга JSON: {e}")
    print(f"Полученный текст от Gemini:\n{raw_text}")
    raise e

  dir_name = data["dir_name"]
  html_code = data["html_code"]
  news_text = data["news_text"]
  new_game_entry = data["news_json_entry"]

  headers = {
      "Authorization": f"Bearer {GITHUB_TOKEN}",
      "Accept": "application/vnd.github+json",
  }

  encoded_html = base64.b64encode(html_code.encode("utf-8")).decode("utf-8")
  file_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/games/{dir_name}/index.html"
  requests.put(
      file_url,
      json={
          "message": f"Add new game {dir_name}",
          "content": encoded_html,
      },
      headers=headers,
  )

  json_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/games.json"
  res = requests.get(json_url, headers=headers)
  file_data = res.json()
  sha = file_data["sha"]
  current_json = json.loads(
      base64.b64decode(file_data["content"]).decode("utf-8")
  )

  current_json.append(new_game_entry)
  updated_content = base64.b64encode(
      json.dumps(current_json, ensure_ascii=False, indent=2).encode("utf-8")
  ).decode("utf-8")

  requests.put(
      json_url,
      json={
          "message": f"Update games.json with {dir_name}",
          "content": updated_content,
          "sha": sha,
      },
      headers=headers,
  )

  users_res = requests.get(
      f"{PYTHONANYWHERE_URL}/get-users/{BROADCAST_SECRET}"
  )
  if users_res.status_code != 200:
    print("Ошибка получения пользователей с PythonAnywhere")
    return

  users = users_res.json()

  for chat_id in users:
    try:
      bot.send_message(chat_id=chat_id, text=news_text, parse_mode="Markdown")
    except Exception as e:
      print(f"Не удалось отправить сообщение для {chat_id}: {e}")


if __name__ == "__main__":
  main()
