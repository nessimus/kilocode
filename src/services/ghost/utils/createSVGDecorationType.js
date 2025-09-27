import * as vscode from "vscode";
import { SvgRenderer } from "./SvgRenderer";
import { getLanguageForDocument, generateHighlightedHtmlWithRanges } from "./CodeHighlighter";
import { getEditorConfiguration } from "../EditorConfiguration";
import { calculateContainerWidth, calculateCharacterWidth } from "./textMeasurement";
import { getThemeColors } from "./ThemeMapper";
/**
 * Create an SVG decoration type that can be applied to an editor
 * @param content The content to render with background highlighting
 * @param document The document context for language detection
 * @param options Additional decoration options
 * @returns A VS Code TextEditorDecorationType ready to use
 */
export async function createSVGDecorationType(content, document, options = {}) {
    const language = getLanguageForDocument(document);
    const config = getEditorConfiguration();
    const { width, height } = calculateSVGDimensions(content.text, config);
    const processedText = language
        ? await highlightCodeWithRanges(content.text, language, content.backgroundRanges)
        : content.text;
    const svgContent = renderSVGContent(processedText, width, height, config);
    const svgDataUri = createSVGDataUri(svgContent);
    return createDecorationTypeFromSVGDataUri(svgDataUri, width, height, config, options);
}
/**
 * Highlight code using Shiki with background ranges for character-level highlighting
 */
async function highlightCodeWithRanges(text, language, backgroundRanges) {
    try {
        const result = await generateHighlightedHtmlWithRanges(text, language, backgroundRanges);
        return result.html;
    }
    catch (error) {
        console.error("Failed to highlight code with Shiki:", error);
        // Fallback to plain text
        return text;
    }
}
/**
 * Calculate dimensions for the SVG based on text content
 */
function calculateSVGDimensions(text, config) {
    const lines = text.split("\n");
    const width = calculateContainerWidth(text, config.fontSize);
    const height = lines.length * config.fontSize * config.lineHeight;
    return {
        width: Math.round(width),
        height: Math.round(height),
    };
}
/**
 * Render SVG content using the SvgRenderer
 */
function renderSVGContent(processedText, width, height, config) {
    const themeColors = getThemeColors();
    const renderer = new SvgRenderer(processedText, {
        width,
        height,
        fontSize: config.fontSize,
        fontFamily: config.fontFamily,
        fontWeight: "normal",
        letterSpacing: 0,
        lineHeight: config.fontSize * config.lineHeight,
        themeColors,
    });
    return renderer.render();
}
/**
 * Create data URI from SVG content
 */
function createSVGDataUri(svgContent) {
    const encodedSvg = encodeURIComponent(svgContent);
    return `data:image/svg+xml,${encodedSvg}`;
}
/**
 * Create VS Code decoration type from data URI
 */
function createDecorationTypeFromSVGDataUri(svgDataUri, width, height, config, options) {
    const marginTop = options.marginTop ?? Math.ceil(0);
    const marginLeft = options.marginLeft ?? Math.ceil(calculateCharacterWidth(config.fontSize) + 6);
    const shadowColor = `rgba(0, 0, 0, 0.2)`;
    return vscode.window.createTextEditorDecorationType({
        after: {
            contentIconPath: vscode.Uri.parse(svgDataUri),
            border: `transparent; position: absolute; z-index: 2147483647;
			filter: drop-shadow(-3px 3px 0px ${shadowColor}) drop-shadow(3px -3px 0px ${shadowColor}) drop-shadow(3px 3px 0px ${shadowColor}) drop-shadow(-3px -3px 0px ${shadowColor});
			margin-top: ${marginTop}px;
			margin-left: ${marginLeft}px;`,
            width: `${width}px`,
            height: `${height}px`,
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
}
//# sourceMappingURL=createSVGDecorationType.js.map