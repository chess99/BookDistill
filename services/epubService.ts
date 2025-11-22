import JSZip from 'jszip';

/**
 * A lightweight EPUB parser to extract plain text.
 * It unzips the container, finds the OPF, reads the spine,
 * and extracts text from HTML chapters in order.
 */
export const parseEpub = async (file: File): Promise<{ text: string; title: string; author: string }> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  // 1. Find the OPF file path from META-INF/container.xml
  const containerXml = await loadedZip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Invalid EPUB: Missing container.xml");

  const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml");
  const rootFile = containerDoc.querySelector("rootfile");
  const opfPath = rootFile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: Cannot find OPF path");

  // 2. Read the OPF file
  const opfContent = await loadedZip.file(opfPath)?.async("string");
  if (!opfContent) throw new Error("Invalid EPUB: OPF file missing");

  const opfDoc = new DOMParser().parseFromString(opfContent, "text/xml");

  // Extract Metadata
  const title = opfDoc.querySelector("metadata > title")?.textContent || file.name.replace('.epub', '');
  const author = opfDoc.querySelector("metadata > creator")?.textContent || "Unknown Author";

  // 3. Parse Manifest and Spine to get reading order
  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const manifestMap = new Map<string, string>(); // id -> href
  manifestItems.forEach(item => {
    manifestMap.set(item.getAttribute("id") || "", item.getAttribute("href") || "");
  });

  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  
  // Resolve base path for relative hrefs in OPF
  const opfFolder = opfPath.substring(0, opfPath.lastIndexOf('/'));
  const resolvePath = (href: string) => {
    if (opfFolder === "") return href;
    return `${opfFolder}/${href}`;
  };

  let fullText = "";

  // 4. Iterate spine and extract text
  for (const item of spineItems) {
    const idref = item.getAttribute("idref");
    if (!idref) continue;
    
    const href = manifestMap.get(idref);
    if (!href) continue;

    const fullPath = resolvePath(href);
    const fileContent = await loadedZip.file(fullPath)?.async("string");
    
    if (fileContent) {
      // Parse HTML chapter
      const doc = new DOMParser().parseFromString(fileContent, "text/html"); // Use text/html for better leniency
      
      // Remove scripts and styles
      const scripts = doc.querySelectorAll('script, style');
      scripts.forEach(s => s.remove());

      // Get text content, normalize whitespace
      const text = doc.body.textContent || "";
      fullText += text.replace(/\s+/g, ' ').trim() + "\n\n";
    }
  }

  return {
    text: fullText,
    title,
    author
  };
};
