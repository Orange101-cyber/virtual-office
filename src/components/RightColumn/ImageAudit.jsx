import { useMemo } from 'react';

function auditImages(content) {
  if (!content) return null;

  // Detect image references in various formats
  const imgTags = content.match(/<img[^>]+>/gi) || [];
  const markdownImgs = content.match(/!\[[^\]]*\]\([^)]+\)/g) || [];
  const urlImages = content.match(/https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp|svg|avif)/gi) || [];

  const allImages = [];

  // Parse HTML img tags
  imgTags.forEach(tag => {
    const src = tag.match(/src=["']([^"']+)["']/)?.[1] || '';
    const alt = tag.match(/alt=["']([^"']*?)["']/)?.[1] || '';
    const width = tag.match(/width=["']?(\d+)/)?.[1];
    const height = tag.match(/height=["']?(\d+)/)?.[1];
    allImages.push({ src, alt, width, height, type: 'html' });
  });

  // Parse markdown images
  markdownImgs.forEach(md => {
    const alt = md.match(/!\[([^\]]*)\]/)?.[1] || '';
    const src = md.match(/\(([^)]+)\)/)?.[1] || '';
    allImages.push({ src, alt, type: 'markdown' });
  });

  // URL-only images (not already captured)
  urlImages.forEach(url => {
    if (!allImages.find(img => img.src === url)) {
      allImages.push({ src: url, alt: '', type: 'url' });
    }
  });

  // Audit checks
  const withAlt = allImages.filter(img => img.alt && img.alt.trim().length > 0);
  const withoutAlt = allImages.filter(img => !img.alt || img.alt.trim().length === 0);
  const webpImages = allImages.filter(img => img.src.match(/\.webp$/i));
  const nonWebp = allImages.filter(img => img.src.match(/\.(jpg|jpeg|png|gif)$/i));
  const hasKeywordAlt = (focusKw) => {
    if (!focusKw) return false;
    return allImages.some(img => img.alt?.toLowerCase().includes(focusKw.toLowerCase()));
  };

  return {
    total: allImages.length,
    images: allImages,
    withAlt: withAlt.length,
    withoutAlt: withoutAlt.length,
    webp: webpImages.length,
    nonWebp: nonWebp.length,
    hasKeywordAlt,
  };
}

function AuditItem({ pass, label, detail }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-b-0">
      <span className={`text-[11px] shrink-0 ${pass ? 'text-green-600' : 'text-red-500'}`}>
        {pass ? '✓' : '✗'}
      </span>
      <div className="flex-1">
        <div className="text-[11px]">{label}</div>
        {detail && <div className="text-[9px] text-gray-400">{detail}</div>}
      </div>
    </div>
  );
}

export default function ImageAudit({ content, focusKeyphrase }) {
  const audit = useMemo(() => auditImages(content), [content]);

  if (!audit || audit.total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
        <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider">
          Image Audit
        </div>
        <div className="p-3.5 text-[11px] text-gray-400">
          No images detected in content. Add images with alt text for better SEO.
        </div>
      </div>
    );
  }

  const hasKwAlt = audit.hasKeywordAlt(focusKeyphrase);

  return (
    <div className="bg-white border border-gray-200 rounded-[7px] overflow-hidden">
      <div className="bg-[#1a1a1a] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between">
        <span>Image Audit</span>
        <span className="font-normal normal-case tracking-normal opacity-60">{audit.total} images</span>
      </div>
      <div className="p-3.5">
        <AuditItem
          pass={audit.withAlt === audit.total}
          label={`All images have alt text (${audit.withAlt}/${audit.total})`}
          detail={audit.withoutAlt > 0 ? `${audit.withoutAlt} missing alt text` : null}
        />
        <AuditItem
          pass={hasKwAlt}
          label="At least one alt tag includes focus keyphrase"
          detail={!hasKwAlt && focusKeyphrase ? `Add "${focusKeyphrase}" to an alt tag` : null}
        />
        <AuditItem
          pass={audit.nonWebp === 0}
          label={`Images use WebP format (${audit.webp}/${audit.total})`}
          detail={audit.nonWebp > 0 ? `${audit.nonWebp} image(s) are JPG/PNG — convert to WebP` : null}
        />
        <AuditItem
          pass={audit.total >= 1}
          label="Hero/header image present"
        />

        {/* Image list */}
        {audit.images.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="text-[9px] font-bold uppercase text-gray-400 mb-1">Detected Images</div>
            {audit.images.slice(0, 10).map((img, i) => {
              const filename = img.src.split('/').pop()?.substring(0, 40) || img.src.substring(0, 40);
              const ext = img.src.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i)?.[1]?.toUpperCase() || '?';
              return (
                <div key={i} className="flex items-center gap-1.5 py-0.5 text-[10px]">
                  <span className={`px-1 py-0 rounded text-[8px] font-bold ${ext === 'WEBP' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-500'}`}>
                    {ext}
                  </span>
                  <span className="text-gray-500 truncate flex-1" title={img.src}>{filename}</span>
                  <span className={`shrink-0 ${img.alt ? 'text-green-600' : 'text-red-400'}`}>
                    {img.alt ? 'alt ✓' : 'no alt'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
