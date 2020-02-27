var ts = require("typescript");
var DirectiveNormalizer = require("@angular/compiler").DirectiveNormalizer;
const compiler_cli = require("@angular/compiler-cli");

var path = require("path");
const cheerio = require("cheerio");

class NarikCompilerPlugin {
  constructor(options) {
    this.options = options;
  }

  isUiTemplateDecorator(decorator, options) {
    return (
      decorator &&
      (decorator.name === "NarikBaseTemplate" ||
        (options.decoratorPattern &&
          decorator.name &&
          decorator.name.match(options.decoratorPattern)))
    );
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
          var ui = isKey
            ? this.options.resolver.Resolve(uiKey)
            : {
                templateUrl: uiKey
              };
          if (ui.templateUrl) {
            var fullUrl = isKey
              ? path.join(aotPlugin._basePath, ui.templateUrl)
              : host.resourceNameToFileName(
                  ui.templateUrl,
                  prenomData.componentType.filePath
                );

            var resource = host.loadResource(fullUrl);
            if (resource.then) {
              resource.then(
                baseTemplate => {
                  r(this.mergeTemplates(baseTemplate, template));
                },
                err => {
                  console.log(err);
                }
              );
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
	  debugger;
    var anCompilerPlugin = compiler.options.plugins.filter(x =>
      x.hasOwnProperty("_JitMode")
    )[0];
    if (!anCompilerPlugin._JitMode) {
      if (anCompilerPlugin._compilerOptions.enableIvy)
        this.applyOnIvyCompiler(anCompilerPlugin);
      else this.applyOnNonIvCompiler();
    }
  }

  applyOnIvyCompiler(plugin) {
    var that = this;
    var originalCreateProgram = compiler_cli.createProgram;
    compiler_cli.createProgram = function(
      data
    ) {
      let program = originalCreateProgram.call(
        compiler_cli,
        data
      );

      var originalmakeCompilation = program.compiler.makeCompilation;
      program.compiler.makeCompilation = function() {
        let compilation = originalmakeCompilation.call(program.compiler);

        var componentHandler = compilation.traitCompiler.handlers.filter(
          h => h.constructor.name === "ComponentDecoratorHandler"
        )[0];

        if (componentHandler) {
          var original_extractInlineTemplate =
            componentHandler._extractInlineTemplate;
          var original_extractExternalTemplate =
            componentHandler._extractExternalTemplate;
          componentHandler._extractInlineTemplate = function(
            node,
            decorator,
            component,
            containingFile
          ) {
            if (that.getTemplateDecorator(program, node)) {
              throw `Narik Template Inheritance dose not support "inlineTemplate".
               Please use templateUrl instead of template!(${node.name.escapedText}:${containingFile})`;
            } else {
              return original_extractInlineTemplate.call(
                this,
                componentHandler,
                node,
                decorator,
                component,
                containingFile
              );
            }
          };

          componentHandler._extractExternalTemplate = function(
            node,
            component,
            templateUrlExpr,
            resourceUrl
          ) {
            if (!that.getTemplateDecorator(program, node)) {
              return original_extractExternalTemplate.call(
                this,
                node,
                component,
                templateUrlExpr,
                resourceUrl
              );
            }

            let templateStr = this.resourceLoader.load(resourceUrl);
            //
            //Apply Template
            //
            templateStr = that.applyTemplateOnNode(
              plugin,
              program,
              node,
              templateStr,
              this.resourceLoader
            );

            if (this.depTracker !== null) {
              this.depTracker.addResourceDependency(
                node.getSourceFile(),
                resourceUrl
              );
            }

            const template = this._parseTemplate(
              component,
              templateStr,
              resourceUrl,
              /* templateRange */ undefined,
              /* escapedString */ false
            );

            return {
              ...template,
              sourceMapping: {
                type: "external",
                componentClass: node,
                node: templateUrlExpr,
                template: templateStr,
                templateUrl: resourceUrl
              }
            };
          };
        }

        return compilation;
      };

      return program;
    };
  }

  getTemplateDecorator(program, node) {
    var reflector = program.compiler.compilation.traitCompiler.reflector;
    var decorators = reflector.getDecoratorsOfDeclaration(node);

    return decorators.filter(x =>
      this.isUiTemplateDecorator(x, this.options)
    )[0];
  }
  applyTemplateOnNode(plugin, program, node, templateStr, resourceLoader) {
    var templateDecorator = this.getTemplateDecorator(program, node);
    if (templateDecorator) {
      var uiKey =
        templateDecorator.name === "NarikBaseTemplate"
          ? templateDecorator.args[0].text
          : templateDecorator.name;

      var ui = this.options.resolver.Resolve(uiKey);
      if (ui) {
        let baseTemplateStr = "";
        if (ui.templateUrl) {
          var fullUrl = path.join(plugin._basePath, ui.templateUrl);
          baseTemplateStr = resourceLoader.load(fullUrl);
        } else {
          baseTemplateStr = ui.template;
        }
        if (baseTemplateStr)
          templateStr = this.mergeTemplates(baseTemplateStr, templateStr);
      }
    }

    return templateStr;
  }

  applyOnNonIvCompiler() {
    var self = this;

    DirectiveNormalizer.prototype._preParseTemplate = function(prenomData) {
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
          template.then(
            template => {
              self.applyUiTemplate(anCompilerPlugin, prenomData, template).then(
                nTemplate =>
                  resolve(
                    this._preparseLoadedTemplate(
                      prenomData,
                      nTemplate,
                      templateUrl
                    )
                  ),
                err => {
                  console.log(err);
                }
              );
            },
            err => {
              console.log(err);
            }
          );
        });
      } else {
        return new Promise((resolve, reject) => {
          self.applyUiTemplate(anCompilerPlugin, prenomData, template).then(
            nTemplate =>
              resolve(
                this._preparseLoadedTemplate(prenomData, nTemplate, templateUrl)
              ),
            err => {
              console.log(err);
            }
          );
        });
      }
    };
  }

  getTemplateRange(templateExpr) {
    const startPos = templateExpr.getStart() + 1;
    const { line, character } = ts.getLineAndCharacterOfPosition(
      templateExpr.getSourceFile(),
      startPos
    );
    return {
      startPos,
      startLine: line,
      startCol: character,
      endPos: templateExpr.getEnd() - 1
    };
  }
}
module.exports = NarikCompilerPlugin;
