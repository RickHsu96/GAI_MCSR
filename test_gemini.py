"""
Gemini API 測試腳本
測試你的 API Key 是否正常運作
"""

import os

# 請將你的 API Key 貼在這裡
API_KEY = "AIzaSyAhA-x-tDmrb8xyzA50oQJR0ZXzgxLFCMw"

# 或者從環境變數讀取
# API_KEY = os.environ.get("GEMINI_API_KEY", "")

def test_gemini_api():
    import urllib.request
    import urllib.error
    import json
    
    if not API_KEY or API_KEY == "在這裡貼上你的 GEMINI API KEY":
        print("❌ 請先在腳本中設定你的 API Key！")
        return
    
    # 測試不同的模型
    models = [
        "gemini-2.5-flash"
    ]
    
    print("=" * 50)
    print("Gemini API 測試")
    print("=" * 50)
    print(f"API Key: {API_KEY[:10]}...")
    print()
    
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
        
        data = {
            "contents": [
                {
                    "parts": [
                        {"text": "Say 'Hello' in one word."}
                    ]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 10
            }
        }
        
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                print(f"✅ {model}: 成功！回應: {text.strip()}")
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                error_json = json.loads(error_body)
                error_msg = error_json.get("error", {}).get("message", "Unknown error")
                error_code = error_json.get("error", {}).get("code", "")
                print(f"❌ {model}: HTTP {e.code} - {error_code}")
                print(f"   錯誤: {error_msg[:100]}...")
            except:
                print(f"❌ {model}: HTTP {e.code}")
                print(f"   {error_body[:100]}...")
                
        except Exception as e:
            print(f"❌ {model}: {str(e)}")
        
        print()

if __name__ == "__main__":
    test_gemini_api()
    print("=" * 50)
    print("測試完成！")
    print()
    print("如果所有模型都失敗：")
    print("1. 確認 API Key 正確")
    print("2. 確認已連結 Google Cloud 帳單帳戶")
    print("3. 嘗試建立新的 API Key")
