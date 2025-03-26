(function() {
    // ====================== 样式 ======================
    const style = document.createElement('style');
    style.textContent = `
        #progress-container {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            border: 1px solid #e0e0e0;
            width: 300px;
            box-sizing: border-box;
        }
        #progress-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
        }
        #progress-bar {
            width: 100%;
            height: 20px;
            background: #f0f0f0;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        #progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 10px;
        }
        #progress-text {
            font-size: 14px;
            color: #666;
            text-align: center;
        }
        #progress-details {
            font-size: 12px;
            color: #888;
            margin-top: 5px;
            white-space: pre-wrap;
        }
    `;
    document.head.appendChild(style);

    // ====================== 搞个进度条 ======================
    const createProgressBar = () => {
        const container = document.createElement('div');
        container.id = 'progress-container';
        container.innerHTML = `
            <div id="progress-title">结束还有残留就再跑一次</div>
            <div id="progress-bar"><div id="progress-fill"></div></div>
            <div id="progress-text">准备开始...</div>
            <div id="progress-details"></div>
        `;
        document.body.appendChild(container);
        
        return {
            update: (percent, message, details = '') => {
                document.getElementById('progress-fill').style.width = `${percent}%`;
                document.getElementById('progress-text').textContent = message;
                document.getElementById('progress-details').textContent = details;
            },
            remove: () => container.remove()
        };
    };

    // ====================== 工具 ======================
    const getHashParams = () => {
        const hash = window.location.hash;
        const queryIndex = hash.indexOf('?');
        if (queryIndex === -1) return {};
        const query = hash.slice(queryIndex + 1);
        return Object.fromEntries(new URLSearchParams(query).entries());
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ====================== 获取Cookie值 ======================
    const getCookies = () => {
        return {
            customSession: prompt("输入custom.session（有就填，没有就不填）:"),
            jsessionId: prompt("输入JSESSIONID的值（有就填，没有就不填）:"),
            ts01261658: prompt("输入TS01261658的值（有就填，没有就不填）:")
        };
    };

    // ====================== 第一阶段：收集classId ======================
    const collectClassIds = async (progressBar, tokenId, trainingId) => {
        const classIds = [];
        let pageIndex = 1;
        let hasMore = true;
        const firstApiUrl = 'https://www.mvazqh.org.cn/AppInterface/app/trainingDetailRequire.do';

        progressBar.update(0, '正在收集ID...', '准备请求第一页');
        
        while (hasMore) {
            try {
                const response = await fetch(firstApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        funcId: "",
                        params: {
                            tokenId,
                            trainingId,
                            pageIndex: pageIndex.toString(),
                            state: "1"
                        }
                    })
                });

                const data = await response.json();
                const currentCount = classIds.length;
                
                if (data.contentList?.classArray?.length > 0) {
                    data.contentList.classArray.forEach(item => {
                        if (item.classId) classIds.push(item.classId);
                    });
                    
                    progressBar.update(
                        Math.min(33, Math.floor((pageIndex / 10) * 33)), // 限制在33%以内
                        `收集ID中...`,
                        `已获取 ${classIds.length} 个ID\n当前页: ${pageIndex}`
                    );
                    
                    pageIndex++;
                    await sleep(500); // 请求间隔
                } else {
                    hasMore = false;
                }
            } catch (error) {
                console.error('收集classId出错:', error);
                progressBar.update(33, '收集ID遇到错误', error.message);
                await sleep(1000);
            }
        }

        progressBar.update(33, `共收集到 ${classIds.length} 个ID`, '准备收集ID...');
        return classIds;
    };

    // ====================== 第二阶段：收集chapterId ======================
    const collectChapterIds = async (progressBar, tokenId, trainingId, classIds) => {
        const chapterData = {};
        const secondApiUrl = 'https://www.mvazqh.org.cn/AppInterface/app/classDetailChapterList.do';
        const totalClasses = classIds.length;
        let processedClasses = 0;

        progressBar.update(33, '开始收集ID...', `0/${totalClasses} 处理中`);
        
        // 并发加快一哈速度
        const concurrentLimit = 5;
        for (let i = 0; i < classIds.length; i += concurrentLimit) {
            const batch = classIds.slice(i, i + concurrentLimit);
            await Promise.all(batch.map(async (classId) => {
                try {
                    const response = await fetch(secondApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            funcId: "",
                            params: {
                                tokenId,
                                trainingId,
                                classId
                            }
                        })
                    });

                    const data = await response.json();
                    
                    if (data.contentList?.chapterArr?.length > 0) {
                        chapterData[classId] = data.contentList.chapterArr.map(chapter => chapter.chapterId);
                    } else {
                        chapterData[classId] = [];
                    }
                    
                    processedClasses++;
                    const progress = 33 + Math.floor((processedClasses / totalClasses) * 33);
                    progressBar.update(
                        Math.min(66, progress),
                        `收集ID中...`,
                        `${processedClasses}/${totalClasses} 处理完成\n当前: ${classId}`
                    );
                } catch (error) {
                    console.error(`获取classId ${classId}的chapterId出错:`, error);
                    chapterData[classId] = [];
                    processedClasses++;
                }
                await sleep(300); // 请求间隔
            }));
            
            await sleep(500); // 批次间隔
        }

        const validClasses = Object.entries(chapterData).filter(([_, chapters]) => chapters.length > 0);
        const totalChapters = validClasses.reduce((sum, [_, chapters]) => sum + chapters.length, 0);
        
        progressBar.update(66, `共收集到 ${totalChapters} 个ID`, '准备记录进度...');
        return { chapterData, totalChapters };
    };

    // ====================== 第三阶段：记录进度 ======================
    const recordStudyProgress = async (progressBar, tokenId, trainingId, chapterData, totalChapters, cookies) => {
        const apiUrl = 'https://www.mvazqh.org.cn/AppInterface/app/saveClassStudyProgress.do';
        const { customSession, jsessionId, ts01261658 } = cookies;
        
        // 构建Cookie头（只添加存在的Cookie）
        let cookieHeader = [];
        if (customSession) cookieHeader.push(`custom.session=${customSession}`);
        if (jsessionId) cookieHeader.push(`JSESSIONID=${jsessionId}`);
        if (ts01261658) cookieHeader.push(`TS01261658=${ts01261658}`);
        
        let completedChapters = 0;
        let totalRequests = 0;
        
        // 并发
        const concurrentLimit = 3;
        const allChapters = [];
        
        // 准备所有数据
        Object.entries(chapterData).forEach(([classId, chapterIds]) => {
            chapterIds.forEach(chapterId => {
                allChapters.push({ classId, chapterId });
            });
        });

        progressBar.update(66, '开始记录进度...', `0/${totalChapters} 处理中`);
        
        for (let i = 0; i < allChapters.length; i += concurrentLimit) {
            const batch = allChapters.slice(i, i + concurrentLimit);
            await Promise.all(batch.map(async ({ classId, chapterId }) => {
                let success = false;
                let constantNum = 1;
                let studyLong = 0;
                
                while (!success) {
                    try {
                        const params = {
                            "funcId": "",
                            "params": {
                                "tokenId": tokenId,
                                "classId": classId,
                                "chapterId": chapterId,
                                "trainingId": trainingId,
                                "studyTimePoint": "0",
                                "studyLong": studyLong.toFixed(1),
                                "chapter": "0",
                                "continuStudy": "",
                                "constantRequestNum": constantNum.toString(),
                                "lastErrorState": "1000"
                            }
                        };
                        
                        const headers = { 'Content-Type': 'application/json' };
                        if (cookieHeader.length > 0) {
                            headers['Cookie'] = cookieHeader.join('; ');
                        }
                        
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify(params)
                        });
                        
                        const data = await response.json();
                        totalRequests++;
                        
                        if (data.code == 4001) {
                            completedChapters++;
                            success = true;
                            
                            const progress = 66 + Math.floor((completedChapters / totalChapters) * 34);
                            progressBar.update(
                                Math.min(100, progress),
                                `记录进度中...`,
                                `${completedChapters}/${totalChapters} 完成\n当前: ${classId}/${chapterId}\n总请求数: ${totalRequests}`
                            );
                        } else {
                            constantNum++;
                            studyLong += 7;
                            await sleep(300); // 请求间隔
                        }
                    } catch (error) {
                        console.error(`请求出错 - classId:${classId}, chapterId:${chapterId}`, error);
                        await sleep(1000); // 出错后延迟
                    }
                }
            }));
            
            await sleep(500); // 批次间隔
        }

        progressBar.update(100, '全部完成!', `共完成 ${completedChapters} 个章节\n总请求数: ${totalRequests}`);
        return totalRequests;
    };

    // ====================== 主执行函数 ======================
    const main = async () => {
        // 显示进度条
        const progressBar = createProgressBar();
        
        try {
            // 获取基础参数
            const tokenId = localStorage.getItem('tokenId');
            if (!tokenId) {
                const input = prompt('未找到tokenId，请手动输入:');
                if (!input) return;
                localStorage.setItem('tokenId', input);
            }
            
            const trainingId = getHashParams().trainingId;
            if (!trainingId) {
                progressBar.update(0, '错误: URL中未找到trainingId', '请确保URL包含trainingId参数');
                return;
            }
            
            // 获取Cookie值
            progressBar.update(0, '准备开始...', '请输入Cookie值（有就填，没有就不填）');
            const cookies = getCookies();
            
            // 第一阶段：收集classId
            const classIds = await collectClassIds(progressBar, localStorage.getItem('tokenId'), trainingId);
            if (classIds.length === 0) {
                progressBar.update(100, '错误: 未收集到任何ID', '请检查第一阶段API响应');
                return;
            }
            
            // 第二阶段：收集chapterId
            const { chapterData, totalChapters } = await collectChapterIds(progressBar, localStorage.getItem('tokenId'), trainingId, classIds);
            if (totalChapters === 0) {
                progressBar.update(100, '错误: 未收集到任何章节ID', '请检查第二阶段API响应');
                return;
            }
            
            // 第三阶段：记录学习进度
            await recordStudyProgress(progressBar, localStorage.getItem('tokenId'), trainingId, chapterData, totalChapters, cookies);
            
            // 完成后3秒隐藏进度条
            await sleep(3000);
            progressBar.remove();
            
            console.log('全部处理完成!', {
                classIds,
                chapterData,
                totalChapters
            });
        } catch (error) {
            console.error('主流程出错:', error);
            progressBar.update(100, '处理出错', error.message);
            await sleep(5000);
            progressBar.remove();
        }
    };

    // 开始执行
    main();
})();