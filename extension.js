const vscode = require('vscode');

function activate(context) {
    console.log('CP Bit Lens is now active!');

    let command = vscode.commands.registerCommand('cp-bit-lens.openPanel', function () {
        const panel = vscode.window.createWebviewPanel(
            'cpBitLens',
            'CP Bit Lens',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );
        panel.webview.html = getWebviewContent();
    });

    context.subscriptions.push(command);
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html>
<head>
<style>
    body {
        font-family: monospace;
        padding: 16px;
        background: #1e1e1e;
        color: #d4d4d4;
        font-size: 13px;
    }
    h3 { color: #569cd6; margin-bottom: 12px; }

    input[type="text"] {
        width: 100%;
        padding: 8px;
        background: #2d2d2d;
        color: #d4d4d4;
        border: 1px solid #444;
        font-family: monospace;
        font-size: 14px;
        box-sizing: border-box;
        margin-bottom: 12px;
    }

    /* Checkbox row styling */
    .checkboxes {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
        padding: 10px;
        background: #2d2d2d;
        border: 1px solid #444;
    }
    .checkboxes label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        color: #ccc;
    }
    .checkboxes input[type="checkbox"] {
        cursor: pointer;
        width: 14px;
        height: 14px;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4px;
    }
    th {
        color: #888;
        text-align: left;
        padding: 5px 8px;
        border-bottom: 1px solid #444;
    }
    td {
        padding: 5px 8px;
        border-bottom: 1px solid #2a2a2a;
    }
    tr:hover td { background: #2a2a2a; }

    .summary {
        margin-top: 14px;
        padding: 10px 14px;
        background: #2d2d2d;
        border-left: 3px solid #569cd6;
        line-height: 1.8;
    }
    .warn { color: #f48771; font-size: 11px; margin-bottom: 8px; }
    .tag-even { color: #4ec9b0; }
    .tag-odd  { color: #f48771; }
    .tag-yes  { color: #4ec9b0; }
    .tag-no   { color: #888; }
</style>
</head>
<body>

<h3>⚡ CP Bit Lens</h3>

<!-- Number input -->
<input type="text" id="inp" placeholder="Paste numbers: 12 7 5 3 1000000007" oninput="analyze()" />

<!-- Feature checkboxes — user picks what to show -->
<div class="checkboxes">
    <label><input type="checkbox" id="cb_binary"  checked onchange="analyze()"> Binary</label>
    <label><input type="checkbox" id="cb_factors" checked onchange="analyze()"> Prime Factors</label>
    <label><input type="checkbox" id="cb_divcount" checked onchange="analyze()"> Divisor Count</label>
    <label><input type="checkbox" id="cb_sq"      checked onchange="analyze()"> Perfect Square</label>
    <label><input type="checkbox" id="cb_prime"   checked onchange="analyze()"> Is Prime</label>
    <label><input type="checkbox" id="cb_xor"     checked onchange="analyze()"> XOR/AND/OR</label>
</div>

<div id="output"></div>

<script>
    // ── helpers ──────────────────────────────────────────

    // Superscript digits for prime factor display e.g. 2³
    const SUP = ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];

    // Use BigInt throughout so 1e18 is handled perfectly
    function primeFactors(n) {
        // n is a BigInt here
        if (n <= 1n) return String(n);
        
        // For very large numbers (> 1e12), factorization is too slow
        // Only one prime > 1e6 can exist, so we trial divide up to 1e6
        let result = '';
        const LIMIT = 1000000n;

        for (let i = 2n; i <= LIMIT && i * i <= n; i++) {
            if (n % i === 0n) {
                let exp = 0;
                while (n % i === 0n) { exp++; n = n / i; }
                const expStr = exp > 1 ? SUP[exp] : '';
                result += (result ? '×' : '') + i.toString() + expStr;
            }
        }
        // remaining n is either 1 or a large prime
        if (n > 1n) result += (result ? '×' : '') + n.toString();
        return result || '1';
    }

    function divisorCount(n) {
        // Trial division up to sqrt(n)
        // For n > 1e12 this can be slow, so we cap
        if (n > 1000000000000n) return '?'; // too slow
        let count = 0n;
        for (let i = 1n; i * i <= n; i++) {
            if (n % i === 0n) count += (i === n / i) ? 1n : 2n;
        }
        const c = Number(count);
        const tag = c % 2 === 0 
            ? '<span class="tag-even">' + c + ' (even)</span>'
            : '<span class="tag-odd">'  + c + ' (odd)</span>';
        return tag;
    }

    function isPerfectSquare(n) {
        if (n < 0n) return false;
        const s = BigInt(Math.round(Math.sqrt(Number(n))));
        // check s-1, s, s+1 because of float rounding for large n
        for (let d = -1n; d <= 1n; d++) {
            if ((s + d) * (s + d) === n) return true;
        }
        return false;
    }

    function isPrime(n) {
        if (n < 2n) return false;
        if (n === 2n) return true;
        if (n % 2n === 0n) return false;
        // For n > 1e12, trial division is slow — return '?'
        if (n > 1000000000000n) return '?';
        for (let i = 3n; i * i <= n; i += 2n)
            if (n % i === 0n) return false;
        return true;
    }

    // pad binary to maxBits width
    function padBin(n, maxBits) {
        return n.toString(2).padStart(maxBits, '0');
    }

    // ── main analyze function ─────────────────────────────
    function analyze() {
        const raw    = document.getElementById('inp').value.trim();
        const output = document.getElementById('output');
        if (!raw) { output.innerHTML = ''; return; }

        // Read checkbox states
        const show = {
            binary:  document.getElementById('cb_binary').checked,
            factors: document.getElementById('cb_factors').checked,
            divcount:document.getElementById('cb_divcount').checked,
            sq:      document.getElementById('cb_sq').checked,
            prime:   document.getElementById('cb_prime').checked,
            xor:     document.getElementById('cb_xor').checked,
        };

        // Parse — accept integers and scientific notation like 1e9
        let nums;
        try {
            nums = raw.split(/\\s+/)
                .map(s => BigInt(Math.round(Number(s))))
                .filter(n => n >= 0n);
        } catch(e) {
            output.innerHTML = '<div class="warn">⚠️ Invalid input</div>';
            return;
        }
        if (nums.length === 0) { output.innerHTML = ''; return; }

        // max bits for padding binary column
        const maxBits = show.binary
            ? Math.max(...nums.map(n => n.toString(2).length))
            : 0;

        // ── build table ──
        // Only show columns that are checked
        let headers = '<tr>';
        headers += '<th>Number</th>';
        if (show.binary)   headers += '<th>Binary</th>';
        if (show.factors)  headers += '<th>Prime Factors</th>';
        if (show.divcount) headers += '<th>Divisors</th>';
        if (show.sq)       headers += '<th>Perfect Sq</th>';
        if (show.prime)    headers += '<th>Prime</th>';
        headers += '</tr>';

        let rows = '';
        for (let n of nums) {
            const primeResult = isPrime(n);
            const sqResult    = isPerfectSquare(n);

            rows += '<tr>';
            rows += '<td>' + n.toString() + '</td>';

            if (show.binary)
                rows += '<td>' + padBin(n, maxBits) + '</td>';

            if (show.factors)
                rows += '<td>' + primeFactors(n) + '</td>';

            if (show.divcount)
                rows += '<td>' + divisorCount(n) + '</td>';

            if (show.sq)
                rows += '<td>' + (sqResult ? '✅' : '❌') + '</td>';

            if (show.prime) {
                const display = primeResult === '?' 
                    ? '<span class="warn">?</span>'
                    : (primeResult 
                        ? '<span class="tag-yes">✅</span>' 
                        : '<span class="tag-no">❌</span>');
                rows += '<td>' + display + '</td>';
            }

            rows += '</tr>';
        }

        let html = '<table>' + headers + rows + '</table>';

        // ── XOR / AND / OR summary ──
        if (show.xor && nums.length > 0) {
            let xor = nums.reduce((a, b) => a ^ b, 0n);
            let and = nums.reduce((a, b) => a & b);
            let or  = nums.reduce((a, b) => a | b);

            const summaryBits = Math.max(
                xor.toString(2).length,
                and.toString(2).length,
                or.toString(2).length
            );

            html += '<div class="summary">' +
                '<b>XOR:</b> ' + xor + ' → ' + padBin(xor, summaryBits) + '<br>' +
                '<b>AND:</b> ' + and + ' → ' + padBin(and, summaryBits) + '<br>' +
                '<b>OR: </b> ' + or  + ' → ' + padBin(or,  summaryBits) +
                '</div>';
        }

        output.innerHTML = html;
    }
</script>
</body>
</html>`;
}

function deactivate() {}
module.exports = { activate, deactivate };