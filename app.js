let cy = null;
let edgeMetadata = new Map();

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
                    'background-color': '#e74c3c',
                    'width': 50,
                    'height': 50
                }
            },
            {
                selector: 'edge',
                style: {
                    'line-color': '#bdc3c7',
                    'width': 2,
                    'target-arrow-color': '#bdc3c7',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'control-point-step-size': 40
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'line-color': '#e74c3c',
                    'target-arrow-color': '#e74c3c',
                    'width': 3
                }
            },
            {
                selector: 'node.highlighted',
                style: {
                    'background-color': '#f39c12',
                    'width': 50,
                    'height': 50,
                    'border-width': 3,
                    'border-color': '#e67e22'
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'line-color': '#f39c12',
                    'target-arrow-color': '#f39c12',
                    'width': 3,
                    'z-index': 10
                }
            }
        ],
        layout: {
            name: 'grid',
            rows: 1
        }
    });

    console.log('Cytoscape initialized');

    // ファイル入力イベント
    document.getElementById('fileInput').addEventListener('change', function(e) {
        console.log('File selected');
        const file = e.target.files[0];
        if (!file) return;

        // ファイル名を表示
        document.getElementById('fileName').textContent = `読込ファイル: ${file.name}`;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                console.log('File loaded, parsing CSV...');
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
                const affiliatedOrgIdx = header.indexOf('AffiliatedOrganization');
                const affiliatedOrgNameIdx = header.indexOf('AffiliatedOrganizationName');

                if (sourceIdx === -1 || targetIdx === -1) {
                    showMessage('エラー: "Source" または "Target" 列が見つかりません', 'error');
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
                    const edgeWeight = edgeWeightIdx !== -1 ? parts[edgeWeightIdx]?.trim() : '';
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

    // ノードとエッジ選択イベント
    cy.on('select', 'node', function(e) {
        const node = e.target;
        const infoPanelEl = document.getElementById('networkInfo');
        infoPanelEl.innerHTML = `
            <div class="info-item">
                <label>ノードID</label>
                <p>${node.id()}</p>
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
    });

    // ノードホバーイベント
    cy.on('mouseover', 'node', function(e) {
        const node = e.target;

        // 前の強調表示をクリア
        cy.elements('.highlighted').removeClass('highlighted');

        // このノードから到達可能なノードとエッジを強調表示
        highlightReachableNodes(node);
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
