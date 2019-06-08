var DirectiveNormalizer = require("@angular/compiler").DirectiveNormalizer;
var path = require("path");
const cheerio = require("cheerio");

class NarikCompilerPlugin {
  constructor(options) {
    this.options = options;
  }

  mergeTemplates(baseTemplate, template) {
    const parentDoc$ = cheerio.load(baseTemplate);
    const chilsDoc$ = cheerio.load(template);
    let sectionItems$ = parentDoc$("[narik-section]");

    for (var index = 0; index < sectionItems$.length; index++) {
      var element = sectionItems$[index];
      let sectionName = element.attribs["narik-section"];
      var contentItem = chilsDoc$(`[\\#${sectionName}]`)[0];
      if (contentItem && contentItem.tagName.toLowerCase() === "ng-template") {
        baseTemplate = baseTemplate.replace(
          `narik-section="${sectionName}"`,
          `*ngIf="false; else ${sectionName}"`
        );
      }
    }
    return baseTemplate + template;
  }
  applyUiTemplate(aotPlugin, prenomData, template) {
    return new Promise((r, reject) => {
      var reflector = aotPlugin._program.compiler.reflector;
      var classMetadata = reflector.getTypeMetadata(prenomData.componentType);

      if (classMetadata && classMetadata.decorators) {
        var templateDecorator = classMetadata.decorators.filter(
          x =>
          x.expression.symbol &&
          (x.expression.symbol.name === "NarikBaseTemplate" ||
            (this.options.decoratorPattern &&
              x.expression.symbol.name &&
              x.expression.symbol.name.match(this.options.decoratorPattern)))
        )[0];
        if (templateDecorator) {
          var uiKey = "";
          var isKey = false;

          if (
            templateDecorator.expression.symbol.name !== "NarikBaseTemplate"
          ) {
            isKey = true;
            uiKey = templateDecorator.expression.symbol.name;
          } else {
            var args = templateDecorator.arguments[0];
            if (typeof args === "string") {
              isKey = true;
              uiKey = args;
            } else {
              if (args.baseTemplateKey) {
                isKey = true;
                uiKey = args.baseTemplateKey;
              } else {
                isKey = false;
                uiKey = args.baseTemplateUrl;
              }
            }
          }

          var host = aotPlugin._program.hostAdapter;
          var ui = isKey ?
            this.options.resolver.Resolve(uiKey) : {
              templateUrl: uiKey
            };
          if (ui.templateUrl) {
            var fullUrl = isKey ?
              path.join(aotPlugin._basePath, ui.templateUrl) :
              host.resourceNameToFileName(
                ui.templateUrl,
                prenomData.componentType.filePath
              );

            var resource = host.loadResource(fullUrl);
            if (resource.then) {
              resource.then(baseTemplate => {
                r(this.mergeTemplates(baseTemplate, template));
              }, err => {
                console.log(err);
              });
            } else {
              r(this.mergeTemplates(resource, template));
            }
          } else {
            r(this.mergeTemplates(ui.template, template));
          }
        } else r(template);
      } else r(template);
    });
  }
  apply(compiler) {
    var anCompilerPlugin = compiler.options.plugins.filter(x =>
      x.hasOwnProperty("_JitMode")
    )[0];
    if (!anCompilerPlugin._JitMode) {
      var self = this;

      DirectiveNormalizer.prototype._preParseTemplate = function (prenomData) {
        var template, templateUrl;

        if (prenomData.template != null) {
          template = prenomData.template;
          templateUrl = prenomData.moduleUrl;
        } else {
          templateUrl = this._urlResolver.resolve(
            prenomData.moduleUrl,
            prenomData.templateUrl
          );
          template = this._fetch(templateUrl);
        }

        if (!!template && typeof template.then === "function") {
          return new Promise((resolve, reject) => {
            template.then(template => {
              self
                .applyUiTemplate(anCompilerPlugin, prenomData, template)
                .then(nTemplate =>
                  resolve(
                    this._preparseLoadedTemplate(
                      prenomData,
                      nTemplate,
                      templateUrl
                    )
                  ), (err) => {
                    console.log(err)
                  }
                );
            }, err => {
              console.log(err);
            });
          });
        } else {
          return new Promise((resolve, reject) => {
            self
              .applyUiTemplate(anCompilerPlugin, prenomData, template)
              .then(nTemplate =>
                resolve(
                  this._preparseLoadedTemplate(
                    prenomData,
                    nTemplate,
                    templateUrl
                  )
                ),
                (err) => {
                  console.log(err);
                }
              );
          });
        }
      };
    }
  }
}
module.exports = NarikCompilerPlugin;
