const cheerio = require("cheerio");
const fs = require("fs");

narikWebPackLoader = function (source, sourceMap) {
  debugger;
  const resolver = this.query ? this.query.resolver : null;
  let newSource = source;
  if (resolver) {
    const basePath = this.query.basePath;

    const firstLine = source.split("\n", 1)[0];
    if (firstLine && firstLine.indexOf("#layout:") >= 0) {
      const startPos = firstLine.indexOf("'", firstLine.indexOf("#layout:"));
      if (startPos < 0) {
        startPos = firstLine.indexOf('"', firstLine.indexOf("#layout:"));
      }
      const endPos = firstLine.indexOf("'", startPos + 1);
      if (endPos < 0) {
        endPos = firstLine.indexOf('"', startPos + 1);
      }
      const layoutKey = firstLine.substring(startPos + 1, endPos);
      const info = resolver.Resolve(layoutKey);
      if (info) {
        if (info) {
          if (info.template) {
            newSource = mergeTemplates(info.template, source);
          } else {
            const baseTemplatePath = basePath + "/" + info.templateUrl;
            var baseTemplate = fs.readFileSync(baseTemplatePath, "utf8");
            newSource = mergeTemplates(baseTemplate, source);
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

function mergeTemplates(baseTemplate, template) {
  const parentDoc$ = cheerio.load(baseTemplate);
  const childDoc$ = cheerio.load(template);
  let sectionItems$ = parentDoc$("[narik-section]");

  for (var index = 0; index < sectionItems$.length; index++) {
    var element = sectionItems$[index];
    let sectionName = element.attribs["narik-section"];
    var contentItem = childDoc$(`[\\#${sectionName}]`)[0];
    if (contentItem && contentItem.tagName.toLowerCase() === "ng-template") {
      let find = `narik-section="${sectionName}"`;
      let re = new RegExp(find, "g");
      baseTemplate = baseTemplate.replace(
        re,
        `*ngIf="false; else ${sectionName}"`
      );
      find = `narik-section='${sectionName}'`;
      re = new RegExp(find, "g");
      baseTemplate = baseTemplate.replace(
        re,
        `*ngIf="false; else ${sectionName}"`
      );
    }
  }
  return baseTemplate + template;
}

module.exports = narikWebPackLoader;
