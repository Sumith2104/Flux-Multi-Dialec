const apiKey = 'fl_452311f161ad93badf86d0e333c4a505281ec279eff85f53';
const projectId = 'tygeNt1kN5juQ6jGyjTP';
const query = 'SELECT 1';

async function testScopedKey() {
    console.log('--- Test 1: No Project ID in Body (Should Succeed) ---');
    try {
        const res1 = await fetch('http://localhost:5000/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ query })
        });
        const json1 = await res1.json();
        console.log('Status:', res1.status);
        console.log('Body:', JSON.stringify(json1, null, 2));
    } catch (e) {
        console.error('Test 1 Failed:', e);
    }

    console.log('\n--- Test 2: Mismatched Project ID (Should Fail 403) ---');
    try {
        const res2 = await fetch('http://localhost:5000/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ query, projectId: 'wrong_project_id' })
        });
        const json2 = await res2.json();
        console.log('Status:', res2.status);
        console.log('Body:', JSON.stringify(json2, null, 2));
    } catch (e) {
        console.error('Test 2 Failed:', e);
    }
}

testScopedKey();
