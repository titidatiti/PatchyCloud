const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, exec } = require('child_process');

const packageJsonPath = path.join(__dirname, 'package.json');
const pkg = require(packageJsonPath);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('=============================================');
console.log('      PatchyCloud 打包发布工具');
console.log('=============================================');
console.log(`\n当前版本: ${pkg.version}`);

rl.question('请输入新版本号 (直接回车保持不变, 或输入如 1.3.3): ', (newVersion) => {
    if (newVersion && newVersion.trim() !== '') {
        const versionStr = newVersion.trim();
        // 简单的版本号格式验证
        if (!/^\d+\.\d+\.\d+/.test(versionStr)) {
            console.error('\n❌ 错误: 版本号格式不正确 (应为 x.y.z 格式，例如 1.0.0)');
            rl.close();
            process.exit(1);
            return;
        }

        try {
            pkg.version = versionStr;
            // 保持 package.json 格式（2空格缩进）
            fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
            console.log(`\n✅ package.json 版本号已更新为: ${pkg.version}`);
        } catch (err) {
            console.error('\n❌ 更新 package.json 失败:', err);
            rl.close();
            process.exit(1);
            return;
        }
    } else {
        console.log('\nℹ️ 保持当前版本号不变');
    }

    rl.close();

    console.log('\n🚀 开始打包 (Windows Portable)...');
    console.log('这可能需要几分钟，请耐心等待...\n');

    const startTime = Date.now();

    try {
        // 执行 npm run build-win
        // stdio: 'inherit' 让子进程的输出直接打印到当前控制台
        execSync('npm run build-win', { stdio: 'inherit' });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ 打包完成! 耗时 ${duration} 秒`);

        // 打开输出目录
        const distPath = path.join(__dirname, 'dist');
        if (fs.existsSync(distPath)) {
            console.log(`📁 正在打开输出目录: ${distPath}`);
            exec(`explorer "${distPath}"`);
        }

    } catch (error) {
        console.error('\n❌ 打包过程中出错。请检查上方错误日志。');
        process.exit(1);
    }
});
