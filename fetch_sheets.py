import os
import json
import gspread
from google.oauth2.service_account import Credentials

# 구글 API 인증
scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
service_account_info = json.loads(os.environ["GCP_SERVICE_ACCOUNT_KEY"])
credentials = Credentials.from_service_account_info(service_account_info, scopes=scopes)
gc = gspread.authorize(credentials)

# 스프레드시트 열기
spreadsheet_id = os.environ["SPREADSHEET_ID"]
sh = gc.open_by_key(spreadsheet_id)

# 가져올 시트 목록 및 저장될 JSON 파일명 지정
sheets_to_export = {
    "1972년": "data-main.json",
    "기준표": "data-standard.json",
    "연합별 경제": "data-union.json"
}

for sheet_name, file_name in sheets_to_export.items():
    try:
        worksheet = sh.worksheet(sheet_name)
        records = worksheet.get_all_records()
        
        # JSON 파일로 저장
        with open(file_name, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        print(f"Successfully exported {sheet_name} to {file_name}")
    except Exception as e:
        print(f"Error exporting {sheet_name}: {e}")
