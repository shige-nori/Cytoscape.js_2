let cy = null;
let edgeMetadata = new Map();
let nodeMetadata = new Map();
let nodeTypeColorMap = new Map();  // NodeType → 色のマッピング
let colorPalette = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6', '#34495e', '#c0392b'];
let edgeDataLoaded = false;  // エッジリスト読み込み済みフラグ

// DOMが読込まれるまで待機
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Cytoscape...');
    
    // Cytoscape インスタンスの初期化
    cy = cytoscape({
        container: document.getElementById('cy'),
        headless: false,
        styleEnabled: true,
        style: [
            {
                selector: 'node',
                style: {
                    'content': 'data(id)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'background-color': '#3498db',
                    'width': 40,
                    'height': 40,
                    'font-size': 12,
                    'color': '#fff'
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'background-color': '#8B6F47',
                    'width': 50,
                    'height': 50
                }
            },
            {
                selector: 'edge',
                style: {
                    'line-color': '#bdc3c7',
                    'width': 'mapData(weight, 0, 50, 0.5, 10)',
                    'target-arrow-color': '#bdc3c7',
                    'target-arrow-shape': 'none',
                    'curve-style': 'bezier',
                    'control-point-step-size': 40
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'line-color': '#e74c3c',
                    'target-arrow-color': '#e74c3c',
                    'width': 1
                }
            },
            {
                selector: 'node.highlighted',
                style: {
                    'background-color': '#FFB6C1',
                    'width': 50,
                    'height': 50,
                    'border-width': 1,
                    'border-color': '#e67e22'
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'line-color': '#f39c12',
                    'target-arrow-color': '#f39c12',
                    'width': 1,
                    'z-index': 10
                }
            },
            {
                selector: 'node.type-colored',
                style: {
                    'background-color': 'data(nodeColor)'
                }
            },
            {
                selector: 'node.type-colored:selected',
                style: {
                    'background-color': '#8B6F47',
                    'width': 50,
                    'height': 50
                }
            },
            {
                selector: 'node.type-colored.highlighted',
                style: {
                    'background-color': '#FFB6C1',
                    'width': 50,
                    'height': 50,
                    'border-width': 1,
                    'border-color': '#e67e22'
                }
            }
        ],
        layout: {
            name: 'grid',
            rows: 1
        }
    });

    console.log('Cytoscape initialized');

    // エッジファイル入力イベント
    document.getElementById('edgeFileInput').addEventListener('change', function(e) {
        console.log('Edge file selected');
        const file = e.target.files[0];
        if (!file) return;

        // ファイル名を表示
        document.getElementById('edgeFileName').textContent = `読込ファイル: ${file.name}`;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                console.log('Edge file loaded, parsing CSV...');
                const csv = event.target.result;
                const nodes = [];
                const edges = [];

                // CSV を解析
                const lines = csv.trim().split('\n');
                if (lines.length < 2) {
                    showMessage('エラー: ファイルが空です', 'error');
                    return;
                }

                // ヘッダー行を取得
                const header = lines[0].split(',').map(h => h.trim());
                
                // 必須列のインデックスを取得
                const sourceIdx = header.indexOf('Source');
                const targetIdx = header.indexOf('Target');
                const edgeWeightIdx = header.indexOf('EdgeWeight');
                const affiliatedPapersIdx = header.indexOf('AffiliatedPapers');
                const affiliatedOrgIdx = header.indexOf('AffiliatedOrganizations');
                const affiliatedOrgNameIdx = header.indexOf('AffiliatedOrganizationNames');

                if (sourceIdx === -1 || targetIdx === -1 || affiliatedPapersIdx === -1 || affiliatedOrgIdx === -1 || affiliatedOrgNameIdx === -1) {
                    showMessage('エラー: "Source"、"Target"、"AffiliatedPapers"、"AffiliatedOrganizations"、"AffiliatedOrganizationNames" 列が必要です', 'error');
                    return;
                }

                const nodeSet = new Set();
                edgeMetadata.clear();
                let edgeCount = 0;  // エッジのカウンター

                // データ行を処理
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line === '') continue;

                    const parts = parseCSVLine(line);
                    if (parts.length <= Math.max(sourceIdx, targetIdx)) {
                        showMessage(`警告: 行 ${i + 1} のデータが不足しています`, 'info');
                        continue;
                    }

                    const source = parts[sourceIdx].trim();
                    const target = parts[targetIdx].trim();
                    const edgeWeight = edgeWeightIdx !== -1 ? parseFloat(parts[edgeWeightIdx]?.trim()) || 1 : 1;
                    const affiliatedPapers = affiliatedPapersIdx !== -1 ? parts[affiliatedPapersIdx]?.trim() : '';
                    const affiliatedOrg = affiliatedOrgIdx !== -1 ? parts[affiliatedOrgIdx]?.trim() : '';
                    const affiliatedOrgName = affiliatedOrgNameIdx !== -1 ? parts[affiliatedOrgNameIdx]?.trim() : '';

                    if (!source || !target) continue;

                    // ノードを追加
                    if (!nodeSet.has(source)) {
                        nodeSet.add(source);
                        nodes.push({
                            data: { id: source }
                        });
                    }

                    if (!nodeSet.has(target)) {
                        nodeSet.add(target);
                        nodes.push({
                            data: { id: target }
                        });
                    }

                    // エッジを追加（重複エッジも別々に作成）
                    const edgeId = `edge_${edgeCount}`;  // 一意のID
                    edgeCount++;
                    edges.push({
                        data: {
                            id: edgeId,
                            source: source,
                            target: target,
                            weight: edgeWeight
                        }
                    });

                    // エッジメタデータを保存
                    edgeMetadata.set(edgeId, {
                        weight: edgeWeight,
                        papers: parseListField(affiliatedPapers),
                        organizations: parseListField(affiliatedOrg),
                        organizationNames: parseListField(affiliatedOrgName)
                    });
                }

                if (nodes.length === 0) {
                    showMessage('エラー: 有効なノードデータが見つかりません', 'error');
                    return;
                }

                console.log(`Parsed ${nodes.length} nodes and ${edges.length} edges`);

                // グラフをクリアして新しいデータを追加
                cy.elements().remove();
                cy.add(nodes);
                cy.add(edges);

                console.log('Elements added to graph');

                // dagre を使用して階層的レイアウトを計算
                applyHierarchicalLayout();

                console.log('Hierarchical layout applied');

                // エッジリスト読み込み完了フラグを立てる
                edgeDataLoaded = true;
                
                // ノードリストボタンを有効化
                document.getElementById('nodeFileButton').disabled = false;

                showMessage(`成功: ${nodes.length} 個のノード、${edges.length} 本のエッジを読み込みました`, 'success');

            } catch (error) {
                console.error('Error:', error);
                showMessage(`エラー: ファイルの解析に失敗しました (${error.message})`, 'error');
            }
        };

        reader.onerror = function() {
            showMessage('エラー: ファイルの読込に失敗しました', 'error');
        };

        reader.readAsText(file);
    });

    // ノードファイル入力イベント
    document.getElementById('nodeFileInput').addEventListener('change', function(e) {
        console.log('Node file selected');
        const file = e.target.files[0];
        if (!file) return;

        // ファイル名を表示
        document.getElementById('nodeFileName').textContent = `読込ファイル: ${file.name}`;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                console.log('Node file loaded, parsing CSV...');
                const csv = event.target.result;

                // CSV を解析
                const lines = csv.trim().split('\n');
                if (lines.length < 2) {
                    showMessage('エラー: ノードファイルが空です', 'error');
                    return;
                }

                // ヘッダー行を取得
                const header = lines[0].split(',').map(h => h.trim());

                // ノード ID 列のインデックスを取得
                const nodeIdx = header.indexOf('Node');
                if (nodeIdx === -1) {
                    showMessage('エラー: "Node" 列が見つかりません', 'error');
                    return;
                }

                // ファイルタイプを判定
                const hasNodeType = header.indexOf('NodeType') !== -1;
                const hasAffiliatedPapers = header.indexOf('AffiliatedPapers') !== -1;
                const hasAffiliatedOrganizations = header.indexOf('AffiliatedOrganizations') !== -1;
                const hasAffiliatedOrganizationNames = header.indexOf('AffiliatedOrganizationNames') !== -1;
                const hasNodeWeight = header.indexOf('NodeWeight') !== -1;

                let processedNodesCount = 0;

                // データ行を処理
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line === '') continue;

                    const parts = parseCSVLine(line);
                    if (parts.length <= nodeIdx) {
                        console.warn(`警告: 行 ${i + 1} のデータが不足しています`);
                        continue;
                    }

                    const nodeId = parts[nodeIdx].trim();
                    if (!nodeId) continue;

                    // 既存のノードデータを取得、なければ新規作成
                    let nodeData = nodeMetadata.get(nodeId);
                    if (!nodeData) {
                        nodeData = {};
                    }

                    // 新しいデータを統合（既存データを優先）
                    if (hasNodeType) {
                        const nodeTypeIdx = header.indexOf('NodeType');
                        const nodeType = parts[nodeTypeIdx]?.trim() || '';
                        
                        // nodeTypeが存在しない場合のみ設定
                        if (!nodeData.nodeType && nodeType) {
                            nodeData.nodeType = nodeType;
                            
                            // NodeType に色を割り当てる
                            if (!nodeTypeColorMap.has(nodeType)) {
                                nodeTypeColorMap.set(nodeType, colorPalette[Array.from(nodeTypeColorMap.keys()).length % colorPalette.length]);
                            }
                        }
                    }

                    if (hasAffiliatedPapers) {
                        const papersIdx = header.indexOf('AffiliatedPapers');
                        const papers = parseListField(parts[papersIdx]?.trim() || '');
                        
                        // papers が存在しない場合のみ設定
                        if (!nodeData.papers || nodeData.papers.length === 0) {
                            nodeData.papers = papers;
                        }
                    }

                    if (hasAffiliatedOrganizations) {
                        const orgIdx = header.indexOf('AffiliatedOrganizations');
                        const organizations = parseListField(parts[orgIdx]?.trim() || '');
                        
                        // organizations が存在しない場合のみ設定
                        if (!nodeData.organizations || nodeData.organizations.length === 0) {
                            nodeData.organizations = organizations;
                        }
                    }

                    if (hasAffiliatedOrganizationNames) {
                        const orgNameIdx = header.indexOf('AffiliatedOrganizationNames');
                        const organizationNames = parseListField(parts[orgNameIdx]?.trim() || '');
                        
                        // organizationNames が存在しない場合のみ設定
                        if (!nodeData.organizationNames || nodeData.organizationNames.length === 0) {
                            nodeData.organizationNames = organizationNames;
                        }
                    }

                    if (hasNodeWeight) {
                        const weightIdx = header.indexOf('NodeWeight');
                        const nodeWeight = parts[weightIdx]?.trim() || '';
                        
                        // nodeWeight が存在しない場合のみ設定
                        if (!nodeData.nodeWeight && nodeWeight) {
                            nodeData.nodeWeight = nodeWeight;
                        }
                    }

                    nodeMetadata.set(nodeId, nodeData);
                    processedNodesCount++;
                }

                // ノードの色を適用
                applyNodeStyles();
                
                // グラフ内のすべてのノードに対してもスタイルを再適用
                cy.nodes().forEach(node => {
                    const nodeId = node.id();
                    const nodeData = nodeMetadata.get(nodeId);
                    
                    if (nodeData && nodeData.nodeType) {
                        const color = nodeTypeColorMap.get(nodeData.nodeType) || '#3498db';
                        node.data('nodeColor', color);
                        node.addClass('type-colored');
                    }
                });

                console.log(`Loaded node data for ${processedNodesCount} nodes (total: ${nodeMetadata.size})`);
                showMessage(`成功: ${processedNodesCount} 個のノードデータを読み込みました（合計: ${nodeMetadata.size}個）`, 'success');

            } catch (error) {
                console.error('Error:', error);
                showMessage(`エラー: ノードファイルの解析に失敗しました (${error.message})`, 'error');
            }
        };

        reader.onerror = function() {
            showMessage('エラー: ノードファイルの読込に失敗しました', 'error');
        };

        reader.readAsText(file);
    });

    // ノードとエッジ選択イベント
    cy.on('select', 'node', function(e) {
        const node = e.target;
        const nodeId = node.id();
        const nodeData = nodeMetadata.get(nodeId) || {};
        const infoPanelEl = document.getElementById('networkInfo');
        
        let html = `
            <div class="info-item">
                <label>ノードID</label>
                <p>${nodeId}</p>
            </div>
            <div class="info-item">
                <label>接続数（出次数）</label>
                <p>${node.outdegree()}</p>
            </div>
            <div class="info-item">
                <label>接続数（入次数）</label>
                <p>${node.indegree()}</p>
            </div>
        `;

        if (nodeData.nodeType) {
            html += `
                <div class="info-item">
                    <label>ノードタイプ</label>
                    <p>${nodeData.nodeType}</p>
                </div>
            `;
        }

        if (nodeData.nodeWeight) {
            html += `
                <div class="info-item">
                    <label>ノードウェイト</label>
                    <p>${nodeData.nodeWeight}</p>
                </div>
            `;
        }

        if (nodeData.papers && nodeData.papers.length > 0) {
            html += `
                <div class="info-item">
                    <label>関連論文</label>
                    <p>${nodeData.papers.join('<br>')}</p>
                </div>
            `;
        }

        if (nodeData.organizations && nodeData.organizations.length > 0) {
            html += `
                <div class="info-item">
                    <label>関連機関</label>
                    <p>${nodeData.organizations.join('<br>')}</p>
                </div>
            `;
        }

        if (nodeData.organizationNames && nodeData.organizationNames.length > 0) {
            html += `
                <div class="info-item">
                    <label>機関名</label>
                    <p>${nodeData.organizationNames.join('<br>')}</p>
                </div>
            `;
        }

        infoPanelEl.innerHTML = html;
    });

    // ノードホバーイベント
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;

        // 前の強調表示をクリア
        cy.elements('.highlighted').removeClass('highlighted');

        // このノードから到達可能なノードとエッジを強調表示
        highlightReachableNodes(node);
        
        // ノード自体も強調表示
        node.addClass('highlighted');
    });

    // ノードホバー終了イベント
    cy.on('mouseout', 'node', function() {
        // 強調表示をクリア
        cy.elements('.highlighted').removeClass('highlighted');
    });

    cy.on('select', 'edge', function(e) {
        const edge = e.target;
        const edgeId = edge.id();
        const metadata = edgeMetadata.get(edgeId) || {};

        let html = `
            <div class="info-item">
                <label>エッジID</label>
                <p>${edgeId}</p>
            </div>
            <div class="info-item">
                <label>ソース</label>
                <p>${edge.source().id()}</p>
            </div>
            <div class="info-item">
                <label>ターゲット</label>
                <p>${edge.target().id()}</p>
            </div>
        `;

        if (metadata.weight) {
            html += `
                <div class="info-item">
                    <label>エッジウェイト</label>
                    <p>${metadata.weight}</p>
                </div>
            `;
        }

        if (metadata.papers && metadata.papers.length > 0) {
            html += `
                <div class="info-item">
                    <label>関連論文</label>
                    <p>${metadata.papers.join('<br>')}</p>
                </div>
            `;
        }

        if (metadata.organizations && metadata.organizations.length > 0) {
            html += `
                <div class="info-item">
                    <label>関連機関</label>
                    <p>${metadata.organizations.join('<br>')}</p>
                </div>
            `;
        }

        if (metadata.organizationNames && metadata.organizationNames.length > 0) {
            html += `
                <div class="info-item">
                    <label>機関名</label>
                    <p>${metadata.organizationNames.join('<br>')}</p>
                </div>
            `;
        }

        document.getElementById('networkInfo').innerHTML = html;
    });

    cy.on('unselect', 'node edge', function() {
        document.getElementById('networkInfo').innerHTML = 
            '<p style="color: #999; font-size: 13px;">ノードまたはエッジを選択すると詳細が表示されます</p>';
        
        // 強調表示をクリア
        cy.elements('.highlighted').removeClass('highlighted');
    });

    // ウィンドウリサイズ時にレイアウトを再調整
    window.addEventListener('resize', function() {
        cy.resize();
    });
});

// CSV行をパースする関数（クォートに対応）
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

// リスト形式フィールドをパースする関数（|区切り）
function parseListField(field) {
    if (!field) return [];
    return field.split('|').map(item => item.trim()).filter(item => item !== '');
}

// メッセージ表示関数
function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;

    if (type !== 'error') {
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }
}

// dagre を使用して階層的レイアウトを適用する関数
function applyHierarchicalLayout() {
    if (typeof dagre === 'undefined') {
        console.warn('dagre library not found, using default layout');
        return;
    }

    try {
        // dagre グラフを作成
        const g = new dagre.graphlib.Graph();
        g.setGraph({});
        g.setDefaultNodeLabel(() => ({}));
        g.setDefaultEdgeLabel(() => ({}));

        // ノードをdagre グラフに追加
        cy.nodes().forEach(node => {
            g.setNode(node.id(), { label: node.id(), width: 60, height: 60 });
        });

        // エッジをdagre グラフに追加
        cy.edges().forEach(edge => {
            g.setEdge(edge.source().id(), edge.target().id());
        });

        // レイアウトを計算
        dagre.layout(g);

        // 計算結果をCytoscape に反映
        g.nodes().forEach(nodeId => {
            const node = cy.getElementById(nodeId);
            const pos = g.node(nodeId);
            node.position({
                x: pos.x,
                y: pos.y
            });
        });

        console.log('Hierarchical layout applied successfully');
    } catch (error) {
        console.error('Error applying hierarchical layout:', error);
        // フォールバック: cose レイアウトを使用
        cy.layout({ name: 'cose' }).run();
    }
}

// ノードから到達可能なノードとエッジを強調表示する関数
function highlightReachableNodes(startNode) {
    const visited = new Set();
    const toVisit = [startNode.id()];
    const highlightedNodes = new Set();
    const highlightedEdges = new Set();

    // BFS でソースからターゲット方向の到達可能なノードを探索
    while (toVisit.length > 0) {
        const currentNodeId = toVisit.shift();
        
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);
        highlightedNodes.add(currentNodeId);

        // 現在のノードから出ているエッジを探索
        const outgoingEdges = cy.getElementById(currentNodeId).outgoers().edges();
        outgoingEdges.forEach(edge => {
            const targetNodeId = edge.target().id();
            highlightedEdges.add(edge.id());
            
            if (!visited.has(targetNodeId)) {
                highlightedNodes.add(targetNodeId);
                toVisit.push(targetNodeId);
            }
        });
    }

    // 強調表示を適用
    highlightedNodes.forEach(nodeId => {
        cy.getElementById(nodeId).addClass('highlighted');
    });

    highlightedEdges.forEach(edgeId => {
        cy.getElementById(edgeId).addClass('highlighted');
    });
}

// ノードスタイルを適用する関数
function applyNodeStyles() {
    cy.nodes().forEach(node => {
        const nodeId = node.id();
        const nodeData = nodeMetadata.get(nodeId);
        
        if (nodeData && nodeData.nodeType) {
            const color = nodeTypeColorMap.get(nodeData.nodeType) || '#3498db';
            node.data('nodeColor', color);
            node.addClass('type-colored');
        } else {
            // NodeType がない場合はデフォルト色
            node.removeClass('type-colored');
        }
    });
}
