#!/usr/bin/env python3
"""
Cytoscape.js and dependencies downloader
"""
import urllib.request
import os
import json

# ダウンロード対象のライブラリ
libraries = {
    'cytoscape.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.23.0/cytoscape.min.js',
    'dagre.min.js': 'https://unpkg.com/dagre@0.8.5/dist/dagre.min.js',
    'cytoscape-dagre.js': 'https://unpkg.com/cytoscape-dagre@2.3.2/dist/cytoscape-dagre.umd.js'
}

# lib ディレクトリを作成
os.makedirs('lib', exist_ok=True)

print('Downloading libraries...')
for filename, url in libraries.items():
    try:
        print(f'Downloading {filename} from {url}...')
        urllib.request.urlretrieve(url, os.path.join('lib', filename))
        print(f'✓ {filename} downloaded successfully')
    except Exception as e:
        print(f'✗ Error downloading {filename}: {e}')

print('Done!')
