const cheerio = require("cheerio");
const fs = require("fs");

narikWebPackLoader = function (source, sourceMap) {
  const resolver = this.query ? this.query.resolver : null;
  let keyResolver = this.query ? this.query.keyResolver : null;
  if (!keyResolver) {
    keyResolver = defaultKeyResolver;
  }
  let newSource = source;
  if (resolver) {
    const basePath = this.query.basePath;
    const layoutKey = keyResolver(this.resourcePath, source);
    if (layoutKey) {
      const info = resolver.Resolve(layoutKey);
      if (info) {
        if (info) {
          if (info.layout) {
            newSource = mergeLayout(info.layout, source);
          } else {
            const baseLayoutPath = basePath + "/" + info.layoutUrl;
            var baseLayout = fs.readFileSync(baseLayoutPath, "utf8");
            newSource = mergeLayout(baseLayout, source);
          }
        }
      }
    }
  }
  if (this.callback) {
    this.callback(null, newSource, sourceMap);
  } else {
    return newSource;
  }
};

function defaultKeyResolver(filePath, fileContent) {
  const firstLine = fileContent.split("\n", 1)[0];
  if (firstLine && firstLine.indexOf("#layout:") >= 0) {
    const startPos = firstLine.indexOf("'", firstLine.indexOf("#layout:"));
    if (startPos < 0) {
      startPos = firstLine.indexOf('"', firstLine.indexOf("#layout:"));
    }
    const endPos = firstLine.indexOf("'", startPos + 1);
    if (endPos < 0) {
      endPos = firstLine.indexOf('"', startPos + 1);
    }
    return firstLine.substring(startPos + 1, endPos);
  }
  return undefined;
}

function mergeLayout(layout, template) {
  const parentDoc$ = cheerio.load(layout);
  const childDoc$ = cheerio.load(template);
  let sectionItems$ = parentDoc$("[narik-section]");

  for (var index = 0; index < sectionItems$.length; index++) {
    var element = sectionItems$[index];
    let sectionName = element.attribs["narik-section"];
    var contentItem = childDoc$(`[\\#${sectionName}]`)[0];
    if (contentItem && contentItem.tagName.toLowerCase() === "ng-template") {
      let find = `narik-section="${sectionName}"`;
      let re = new RegExp(find, "g");
      layout = layout.replace(re, `*ngIf="false; else ${sectionName}"`);
      find = `narik-section='${sectionName}'`;
      re = new RegExp(find, "g");
      layout = layout.replace(re, `*ngIf="false; else ${sectionName}"`);
    }
  }
  return layout + template;
}

module.exports = narikWebPackLoader;
