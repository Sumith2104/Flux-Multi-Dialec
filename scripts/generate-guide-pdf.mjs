import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePdf() {
    console.log('🚀 Starting Comprehensive PDF generation...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Path to our HTML template
    const templatePath = path.join(__dirname, '..', 'docs', 'guide_comprehensive.html');
    const outputPath = path.join(__dirname, '..', 'fluxbase-integration-guide.pdf');
    
    console.log(`📂 Loading comprehensive template: ${templatePath}`);
    await page.goto(`file://${templatePath}`);
    
    // Wait for fonts to load
    await page.evaluateHandle(() => document.fonts.ready);
    
    console.log('📄 Rendering 30+ pages PDF...');
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: {
            top: '0mm',
            bottom: '0mm',
            left: '0mm',
            right: '0mm'
        }
    });

    console.log(`✅ SUCCESS: Comprehensive PDF generated at ${outputPath}`);
    await browser.close();
}

generatePdf().catch(err => {
    console.error('❌ PDF generation failed:', err);
    process.exit(1);
});
