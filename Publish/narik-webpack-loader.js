var URI = require('urijs');

var templateIdRegex = /NarikBaseTemplate\s*\((\s*['"`](.*?)['"`]\s*([)}]))/gm;
var baseTemplateUrlRegex = /baseTemplateUrl\s*:(\s*['"`](.*?)['"`]\s*([,}]))/gm;
var baseTemplateKeyRegex = /baseTemplateKey\s*:(\s*['"`](.*?)['"`]\s*([,}]))/gm;
var applyBaseUrlRegex = /applyBaseTemplate\(cls,\s*(\s*['"`](.*?)['"`]\s*([)}]))/gm;
var stringRegex = /(['`"])((?:[^\\]\\\1|.)*?)\1/g;

function replaceStringsWithRequires(string, resolver, basePath) {
  return string.replace(stringRegex, function (match, quote, url) {

    var info = resolver ? resolver.Resolve(url) : null;
    if (info) {
      if (info && info.template)
        return info.template;
      else {
        if (info.templateUrl.charAt(0) === ".")
          info.templateUrl = info.templateUrl.substr(1);
        var d = URI(info.templateUrl).
        relativeTo(basePath.replace(/\\/g, '/')).toString();
        if (d.charAt(0) !== ".") {
          d = "./" + d;
        }
        return "require('" + d + "')";
      }
    } else {
      if (url.charAt(0) !== ".") {
        url = "./" + url;
      }
      return "require('" + url + "')";
    }
  });
}



narikWebPackLoader = function (source, sourcemap) {

  var config = {};
  var resolver = this.query ? this.query.resolver : null;
  var templateDecorator = 'NarikBaseTemplate';
  var baseTemplateUrl = 'baseTemplateUrl:';
  var baseTemplateKey = 'baseTemplateKey:';
  var applyBaseItemFunc = 'applyBaseTemplate(cls,';


  // Not cacheable during unit tests;
  this.cacheable && this.cacheable();


  const plugin = this._compilation._ngToolsWebpackPluginInstance;
  if (!plugin) {
    throw new Error('The AngularCompilerPlugin was not found. ' +
      'The @ngtools/webpack loader requires the plugin.');
  }
  var resourcePath = this.resourcePath;
  var basePath = plugin._basePath;

  resourcePath = resourcePath.replace(basePath, '');

  var newSource = source.replace(templateIdRegex, function (match, url) {
    return templateDecorator + "(" + replaceStringsWithRequires(url, resolver, resourcePath);
  });

  newSource = newSource.replace(applyBaseUrlRegex, function (match, url) {
    return applyBaseItemFunc + replaceStringsWithRequires(url, resolver, resourcePath);
  });

  var newSource = newSource.replace(baseTemplateUrlRegex, function (match, url) {
    return baseTemplateUrl + replaceStringsWithRequires(url, null, resourcePath);
  });

  newSource = newSource.replace(baseTemplateKeyRegex, function (match, url) {
    return baseTemplateKey + replaceStringsWithRequires(url, resolver, resourcePath);
  });

  // Support for tests
  if (this.callback) {
    this.callback(null, newSource, sourcemap)
  } else {
    return newSource;
  }
};

module.exports = narikWebPackLoader;
