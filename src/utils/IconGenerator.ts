import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class IconGenerator {
  private static iconCache: Map<string, vscode.Uri> = new Map();
  private static iconDir: string;

  static initialize(context: vscode.ExtensionContext): void {
    this.iconDir = path.join(context.globalStorageUri.fsPath, 'icons');
    
    // Ensure icon directory exists
    if (!fs.existsSync(this.iconDir)) {
      fs.mkdirSync(this.iconDir, { recursive: true });
    }
  }

  static getColoredIcon(color: string, shape: 'circle' | 'square' = 'circle'): vscode.Uri | vscode.ThemeIcon {
    // Normalize color
    const normalizedColor = this.normalizeColor(color);
    if (!normalizedColor) {
      return new vscode.ThemeIcon('symbol-enum');
    }

    const cacheKey = `${shape}-${normalizedColor}`;
    
    // Check cache
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey)!;
    }

    // Generate SVG
    const svg = this.generateSvg(normalizedColor, shape);
    const fileName = `${cacheKey}.svg`;
    const filePath = path.join(this.iconDir, fileName);

    // Write SVG to file
    fs.writeFileSync(filePath, svg);

    // Create Uri and cache it
    const uri = vscode.Uri.file(filePath);
    this.iconCache.set(cacheKey, uri);

    return uri;
  }

  private static generateSvg(color: string, shape: 'circle' | 'square'): string {
    const size = 16;
    const padding = 2;
    const shapeSize = size - (padding * 2);

    let shapeElement: string;
    if (shape === 'circle') {
      const cx = size / 2;
      const cy = size / 2;
      const r = shapeSize / 2;
      shapeElement = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
    } else {
      shapeElement = `<rect x="${padding}" y="${padding}" width="${shapeSize}" height="${shapeSize}" fill="${color}" rx="2" />`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${shapeElement}
</svg>`;
  }

  private static normalizeColor(color: string): string | null {
    if (!color) return null;

    // If it's already a hex color, validate it
    if (color.startsWith('#')) {
      const hex = color.match(/^#([0-9A-Fa-f]{3}){1,2}$/);
      return hex ? color : null;
    }

    // Convert common color names to hex
    const colorMap: { [key: string]: string } = {
      'red': '#FF0000',
      'green': '#00FF00',
      'blue': '#0000FF',
      'yellow': '#FFFF00',
      'orange': '#FFA500',
      'purple': '#800080',
      'pink': '#FFC0CB',
      'brown': '#A52A2A',
      'black': '#000000',
      'white': '#FFFFFF',
      'gray': '#808080',
      'grey': '#808080',
      'cyan': '#00FFFF',
      'magenta': '#FF00FF',
      'lime': '#00FF00',
      'indigo': '#4B0082',
      'violet': '#EE82EE',
      'turquoise': '#40E0D0',
      'gold': '#FFD700',
      'silver': '#C0C0C0',
      'navy': '#000080',
      'teal': '#008080',
      'maroon': '#800000',
      'olive': '#808000'
    };

    const lowerColor = color.toLowerCase().trim();
    return colorMap[lowerColor] || null;
  }

  static cleanup(): void {
    // Clean up icon files on deactivation
    if (fs.existsSync(this.iconDir)) {
      const files = fs.readdirSync(this.iconDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.iconDir, file));
      });
    }
    this.iconCache.clear();
  }
}