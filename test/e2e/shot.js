/**
 * Screenshot one element plus a comfortable margin of surrounding page.
 *
 * The convention from the stuar.tc screenshot script: never a full page
 * dump - crop to the element that tells the story, with padding so it does
 * not sit flush against the edges. Resets scroll first (boundingBox is
 * viewport relative) and grows the viewport to fit the padded clip, since
 * page.screenshot({clip}) is bounded by the current viewport.
 */
const HIDE_FIXED_CHROME_CSS = `
  #toolbar-administration, .admin-toolbar, .top-bar,
  #announce-toolbar, .region-sticky, .sticky-shadow {
    display: none !important;
  }
  html { scroll-padding-top: 0 !important; }
  body { padding-top: 0 !important; }
`

const shoot = async (page, selector, path, { padding = 0, bottomPadding = 24, bottomSelector = '' } = {}) => {
  await page.addStyleTag({ content: HIDE_FIXED_CHROME_CSS })
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Nothing to capture for ${selector}`)

  // A wrapper region often carries trailing empty space; anchoring the
  // bottom to the last meaningful element trims it away.
  let bottom = box.y + box.height
  if (bottomSelector) {
    const last = await page.locator(bottomSelector).last().boundingBox()
    if (last) bottom = last.y + last.height
  }

  // A region wrapper carries its own internal padding, so the default is a
  // flush crop; extra padding on top of it reads as a lopsided margin.
  const clip = {
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
    width: box.width + padding * 2,
    height: bottom - Math.max(0, box.y - padding) + bottomPadding,
  }
  const viewport = page.viewportSize()
  await page.setViewportSize({
    width: Math.max(viewport.width, Math.ceil(clip.x + clip.width)),
    height: Math.max(viewport.height, Math.ceil(clip.y + clip.height)),
  })
  await page.screenshot({ path, clip })
  await page.setViewportSize(viewport)
}

module.exports = { shoot }
