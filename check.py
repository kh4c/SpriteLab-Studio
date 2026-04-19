import re
import sys

def main():
    try:
        with open('templates/index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        with open('static/js/app.js', 'r', encoding='utf-8') as f:
            js = f.read()

        ids_in_html = set(re.findall(r'id=\"([^\"]+)\"', html))
        ids_in_js = re.findall(r'getElementById\([\'\"]([^\'\"]+)[\'\"]\)', js)

        missing = []
        for js_id in set(ids_in_js):
            if js_id not in ids_in_html:
                missing.append(js_id)
        
        if missing:
            print("Missing IDs in HTML:")
            for m in missing:
                print(f" - {m}")
        else:
            print("All getElementById IDs found in HTML.")
            
        # check event listener missing references
        # Let's see if any missing ID is dereferenced directly in app.js
        for m in missing:
            if re.search(r'getElementById\([\'\"]' + m + r'[\"\']\)\.(onclick|oninput|value|innerText|innerHTML)', js):
                print(f"CRITICAL: Dereferencing missing ID: {m}")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
