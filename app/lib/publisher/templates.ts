export const publisherTemplates: Record<string, string> = {
  'site-header-basic.html': `
<header class="publisher-block publisher-header">
  <div class="publisher-shell publisher-shell--row">
    <a class="publisher-brand" href="/">{{slot:brandName}}</a>
    <nav class="publisher-nav" aria-label="Primary navigation">
      <a href="{{slot:primaryLinkHref}}">{{slot:primaryLinkLabel}}</a>
      <a href="{{slot:secondaryLinkHref}}">{{slot:secondaryLinkLabel}}</a>
    </nav>
  </div>
</header>`,
  'before-content-band.html': `
<section class="publisher-block publisher-band">
  <div class="publisher-shell">
    <span class="publisher-band__eyebrow">{{slot:eyebrow}}</span>
    <p class="publisher-band__message">{{slot:message}}</p>
  </div>
</section>`,
  'hero-centered.html': `
<section class="publisher-block publisher-hero">
  <div class="publisher-shell publisher-shell--narrow">
    <span class="publisher-eyebrow">{{slot:eyebrow}}</span>
    <div class="publisher-hero__title">{{slot:title}}</div>
    <p class="publisher-hero__body">{{slot:body}}</p>
    <a class="publisher-button" href="{{slot:primaryCtaHref}}">{{slot:primaryCtaLabel}}</a>
  </div>
</section>`,
  'content-prose.html': `
<section class="publisher-block publisher-prose">
  <div class="publisher-shell publisher-shell--narrow">
    <div class="publisher-richtext">{{slot:html}}</div>
  </div>
</section>`,
  'sidebar-links.html': `
<aside class="publisher-block publisher-sidebar-block">
  <p class="publisher-sidebar-block__title">{{slot:title}}</p>
  <nav class="publisher-sidebar-nav" aria-label="Sidebar navigation">
    <a href="{{slot:linkOneHref}}">{{slot:linkOneLabel}}</a>
    <a href="{{slot:linkTwoHref}}">{{slot:linkTwoLabel}}</a>
  </nav>
</aside>`,
  'after-content-cta.html': `
<section class="publisher-block publisher-cta">
  <div class="publisher-shell publisher-shell--row publisher-shell--cta">
    <div>
      <p class="publisher-cta__title">{{slot:title}}</p>
      <p>{{slot:body}}</p>
    </div>
    <a class="publisher-button publisher-button--inverse" href="{{slot:buttonHref}}">{{slot:buttonLabel}}</a>
  </div>
</section>`,
  'site-footer-simple.html': `
<footer class="publisher-block publisher-footer">
  <div class="publisher-shell publisher-shell--row">
    <p>{{slot:copyright}}</p>
    <a href="{{slot:footerLinkHref}}">{{slot:footerLinkLabel}}</a>
  </div>
</footer>`,
};
