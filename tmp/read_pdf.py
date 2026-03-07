import sys

try:
    import PyPDF2
    with open('fluxbase_features_detailed.pdf', 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        text = ''
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + '\n'
        
        # Write to a text file rather than relying on stdout buffer limits
        with open('tmp/extracted_pdf.txt', 'w', encoding='utf-8') as out:
            out.write(text)
        print("✅ Successfully extracted PDF to tmp/extracted_pdf.txt")
except Exception as e:
    print("❌ Error processing PDF:", e)
