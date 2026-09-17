import os
import json
import gspread
from google.oauth2.service_account import Credentials

scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
service_account_info = json.loads(os.environ["GCP_SERVICE_ACCOUNT_KEY"])
credentials = Credentials.from_service_account_info(service_account_info, scopes=scopes)
gc = gspread.authorize(credentials)

# 여러 스프레드시트 파일 설정
spreadsheets_config = [
    {
        "id_env": "SPREADSHEET_ID_1",  # 첫 번째 구글 시트 파일
        "fetch_first_tab": True,       # 첫 번째 탭 자동 추출 여부 (이름이 변할 때)
        "first_tab_filename": "data-main.json", # 첫 번째 탭 저장 파일명
        "sheets": {
            "기준표": "data-standard.json",
            "해외경제투자": "data-OEI.json"
        }
    },
    {
        "id_env": "SPREADSHEET_ID_2",  # 두 번째 구글 시트 파일
        "sheets": {
            "시트1": "data-Union.json"
        }
    },
    {
        "id_env": "SPREADSHEET_ID_3",  # 세 번째 구글 시트 파일
        "sheets": {
            "시트1": "data-GDP-per-capiaRank.json"
        }
    },
    {
        "id_env": "SPREADSHEET_ID_4",  # 네 번째 구글 시트 파일
        "sheets": {
            "시트1": "data-DefenceRank.json"
        }
    },
    {
        "id_env": "SPREADSHEET_ID_5",  # 다섯 번째 구글 시트 파일
        "sheets": {
            "시트1": "data-GDPRank.json"
        }
    }
]

for config in spreadsheets_config:
    sheet_id = os.environ.get(config["id_env"])
    if not sheet_id:
        continue
        
    try:
        sh = gc.open_by_key(sheet_id)

        # 1. 시트 이름이 매번 변하는 '첫 번째 탭' 처리
        if config.get("fetch_first_tab"):
            try:
                worksheet = sh.get_worksheet(0)  # 이름과 상관없이 가장 첫 번째 탭 가져오기
                records = worksheet.get_all_records()
                file_name = config.get("first_tab_filename", "data-main.json")
                
                with open(file_name, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2)
                print(f"성공: 첫 번째 시트({worksheet.title}) -> {file_name}")
            except Exception as e:
                print(f"에러 (첫 번째 탭): {e}")

        # 2. 고정된 이름의 다른 시트(탭)들 처리
        if "sheets" in config:
            for sheet_name, file_name in config["sheets"].items():
                try:
                    worksheet = sh.worksheet(sheet_name)
                    records = worksheet.get_all_records()
                    
                    with open(file_name, "w", encoding="utf-8") as f:
                        json.dump(records, f, ensure_ascii=False, indent=2)
                    print(f"성공: {sheet_name} -> {file_name}")
                except Exception as e:
                    print(f"에러 ({sheet_name}): {e}")

    except Exception as e:
        print(f"스프레드시트 열기 실패 ({config['id_env']}): {e}")
