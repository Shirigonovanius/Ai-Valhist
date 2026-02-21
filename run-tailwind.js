const { spawn } = require('child_process');
const path = require('path');

console.log("🚀 Попытка запуска (v5 - PowerShell Edition)...");

// 1. Полный путь к файлу запуска
const tailwindExec = path.join(__dirname, 'node_modules', '.bin', 'tailwindcss.cmd');

// 2. Формируем команду для PowerShell.
// ВАЖНО: В PowerShell мы используем оператор '&' для запуска,
// а путь оборачиваем в ОДИНАРНЫЕ кавычки ('), чтобы спастись от пробелов.
const psCommand = `& '${tailwindExec}' -i ./src/input.css -o ./public/styles.css --watch`;

console.log(`⚙️ Отдаю команду PowerShell:\n${psCommand}\n`);
console.log("🤞 Это последняя надежда программного решения...");

// 3. ЗАПУСК!
// Мы запускаем powershell.exe и передаем ему нашу команду.
// shell: false здесь важно, мы вызываем powershell напрямую.
const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
    stdio: 'inherit'
});

child.on('error', (err) => {
    console.error('\n❌ ОШИБКА PowerShell!');
    console.error('Убедись, что PowerShell установлен (он есть в Windows по умолчанию).');
    console.error('Текст ошибки:', err);
});

child.on('close', (code) => {
    if (code !== 0) {
         console.log(`\n💀 PowerShell завершился с кодом ${code}.`);
    }
});