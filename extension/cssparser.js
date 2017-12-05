const splitCSS = (()=>{

// The code above the rule is pretty much a direct translation
// of the CSS Syntax Module Level 3 as of 2014-02-20,
// chapters 4 and 5.

function isnewline(c) {
  return c === '\n' || c === '\r' || c === '\f';
}

function iswhite(c) {
  return isnewline(c) || c === '\t' || c === ' ';
}

function isdigit(c) {
  return '0' <= c && c <= '9';
}

function isxdigit(c) {
  return isdigit(c) || 'A' <= c && c <= 'F' || 'a' <= c && c <= 'f';
}

function isescape(s, i) {
  return i + 1 < s.length && s[i] === '\\' && !isnewline(s[i + 1]);
}

function isupper(c) {
  return 'A' <= c && c <= 'Z';
}

function islower(c) {
  return 'a' <= c && c <= 'z';
}

function isletter(c) {
  return isupper(c) || islower(c);
}

function isnonascii(c) {
  return c >= '\x80';
}

function isnonprint(c) {
  return c <= '\x08' || c === '\x0B' || '\x0E' <= c && c <= '\x1F' || c === '\x7F';
}

function isnamestart(c) {
  return isletter(c) || isnonascii(c) || c == '_';
}

function isname(c) {
  return isnamestart(c) || isdigit(c) || c == '-';
}

function wouldStartId(s, i) {
  return s[i] === '-' && (i + 1 < s.length && isnamestart(s[i + 1]) || 
                          isescape(s, i + 1)) ||
    isnamestart(s[i]) ||
    isescape(s, i);
}

function isnumber(s, i) {
  return (s[i] === '-' || s[i] === '+') && i + 1 < s.length && (isdigit(s[i + 1]) ||
                                                                s[i + 1] === '.' && i + 2 < s.length && isdigit(s[i + 2])) ||
    s[i] === '.' && i + 1 < s.length && isdigit(s[i + 1]) ||
    isdigit(s[i]);
}

// Tokenizer helper functions accept a string `s` and a position `i`.
// They return token-specific properties
// along with `start` and `end` positions.

function consumeWhitespace(s, i) {
  var start = i;
  while (i < s.length && iswhite(s[i])) ++i;
  return {whitespace: null, start, end: i};
}

function consumeEscape(s, i) {
  var start = i;
  if (i === s.length) return {c: '\xFFFD', start, end: i};
  if (isxdigit(s[i])) {
    var next = i + 1;
    while (n < i + 6 && isxdigit(s[next])) ++next;
    var repr = s.substring(i, next);
    var charCode = parseInt(repr, 16);
    if (iswhite(s[next])) ++next;
    if (charCode === 0 || issurrogate(charCode) || charCode > MAX_CODE_POINT)
      return {c: '\xFFFD', start, end: next};
    return {c: String.fromCharCode(charCode), start, end: next};
  }
  return {c: s[i], start, end: i + 1};
}

function consumeString(s, i, q) {
  var result = '', start = i - 1;
  while (i < s.length && s[i] != q) {
    switch (s[i]) {
      case '\n':
      case '\r':
      case '\f':
        return {bad_string: null, start, end: i};
      case '\\':
        if (i + 1 == s.length) break;
        if (isnewline(s[i + 1])) break;
        var {c, end} = consumeEscape(s, i + 1);
        result += c;
        i = end;
        break;
      default:
        result += s[i];
        ++i;
    }
  }
  if (i < s.length) ++i;
  return {string: result, start, end: i};
}

function consumeName(s, i) {
  var name = '', start = i;
  while (i < s.length) {
    if (isname(s[i])) {
      name += s[i];
      ++i;
    } else if (isescape(s, i)) {
      var {c, end} = consumeEscape(s, i);
      i = end;
      name += c;
    } else {
      break;
    }
  }
  return {name, start, end: i};
}

function consumeNumber(s, i) {
  var repr = '', type = 'integer', start = i;
  if (s[i] === '+' || s[i] === '-') {
    repr += s[i];
    ++i;
  }
  while (i < s.length && isdigit(s[i])) {
    repr += s[i];
    ++i;
  }
  if (i < s.length && s[i] === '.' && i + 1 < s.length && isdigit(s[i + 1])) {
    repr += s.substr(i, 2);
    i += 2;
    type = 'number';
    while (i < s.length && isdigit(s[i])) {
      repr += s[i];
      ++i;
    }
  }
  if (i < s.length && (s[i] === 'E' || s[i] === 'e')) {
    var j = i + 1;
    if (j < s.length && (s[j] === '-' || s[j] === '+')) {
      ++j;
    }
    if (j < s.length && isdigit(j)) {
      repr += s.substring(i, j);
      i = j;
      type = 'number';
      while (i < s.length && isdigit(s[i])) {
        repr += s[i];
        ++i;
      }
    }
  }
  var value = parseFloat(repr);
  return {number: {repr, value, type}, start, end: i};
}

function consumeNumeric(s, i) {
  var start = i;
  var {number, end} = consumeNumber(s, i);
  i = end;
  if (wouldStartId(s, i)) {
    var token = {dimension: {...number, unit: ''}};
    var {name, end} = consumeName(s, i);
    token.unit = name;
    token.start = start;
    token.end = end;
    return token;
  } else if (s[i] == '%') {
    var token = {percentage: {repr: number.repr, value: number.value},
                 start, end: i + 1};
    return token;
  }
  return {number, start, end: i};
}

function consumeBadUrlRemnants(s, i) {
  while (i < s.length) {
    switch (s[i]) {
      case ')':
        return i + 1;
      default:
        if (isescape(s, i)) {
          i = consumeEscape(s, i).end;
        } else {
          ++i;
        }
    }
  }
  return i;
}

function consumeUrl(s, i, start) {
  var url = '';
  i = consumeWhitespace(s, i).end;
  if (i === s.length) return {token: {url, start, end: i}, next: i};
  if (s[i] === '"' || s[i] === "'") {
    var token = consumeString(s, i + 1, s[i]);
    i = token.end;
    if ('bad_string' in token) {
      i = consumeBadUrlRemnants(s, i);
      return {bad_url: null, start, end: i};
    }
    url = token.string;
    i = consumeWhitespace(s, i).end;
    if (i === s.length || s[i] === ')') {
      if (i < s.length) ++i;
      return {url, start, end: i};
    }
    i = consumeBadUrlRemnants(s, i);
    return {bad_url: null, start, end: i};
  }
  while (i < s.length) {
    switch (s[i]) {
      case ')':
        ++i;
        return {url, start, end: i};
      case '"':
      case "'":
      case '(':
        i = consumeBadUrlRemnants(s, i);
        return {bad_url: null, start, end: i};
      case '\\':
        if (isescape(s, i)) {
          var {c, end} = consumeEscape(s, i);
          url += c;
          i = end;
        } else {
          i = consumeBadUrlRemnants(s, i);
          return {bad_url: null, start, end: i};
        }
      default:
        if (iswhite(s[i])) {
          i = consumeWhitespace(s, i).end;
          if (i === s.length || s[i] === ')') {
            if (i < s.length) ++i;
            return {url, start, end: i};
          } else {
            i = consumeBadUrlRemnants(s, i);
            return {bad_url: null, start, end: i};
          }
        } else if (isnonprint(s[i])) {
          i = consumeBadUrlRemnants(s, i);
          return {bad_url: null, start, end: i};
        } else {
          url += s[i];
          ++i;
        }
    }
  }
  return {url, start, end: i};
}

function consumeIdentLike(s, i) {
  var start = i;
  var {name, end} = consumeName(s, i);
  i = end;
  if (/^url$/i.test(name) && i < s.length && s[i] === '(') {
    var token = consumeUrl(s, i + 1, start);
    return token;
  } else if (i < s.length && s[i] === '(') {
    return {function: name, start, end: i + 1};
  } else {
    return {ident: name, start, end: i};
  }
}

function consumeUnicodeRange(s, i) {
  var n = 0, start = i;
  while (n < 6 && i + n < s.length && isxdigit(s[i + n])) {
    ++n;
  }
  while (n < 6 && i + n < s.length && s[i + n] === '?') {
    ++n;
  }
  var ss = s.substr(i, n);
  i += n;
  var rangeStart = parseInt(ss.replace('?', '0'), 16), rangeEnd;
  if (ss[n - 1] === '?') {
    rangeEnd = parseInt(ss.replace('?', 'F'), 16);
    return {range: {rangeStart, rangeEnd}, start, end: i};
  }
  if (i + 1 < s.length && s[i] === '-' && isxdigit(s[i + 1])) {
    ++i;
    n = 0;
    while (n < 6 && i + n < s.length && isxdigit(s[i + n])) {
      ++n;
    }
    rangeEnd = s.substr(i, n);
    i += n;
  } else {
    rangeEnd = rangeStart;
  }
  return {range: {rangeStart, rangeEnd}, start, end: i};
}

function* tokens(s) {
  var i = 0;
  while (i < s.length) {
    var here = i;
    switch (s[i]) {
      case '"':
        var token = consumeString(s, i + 1, '"');
        yield token;
        i = token.end;
        break;
      case '#':
        if (i + 1 < s.length && isname(s[i + 1]) || isescape(s, i + 1)) {
          var token = {hash: '', start: i};
          if (wouldStartId(s, i)) token.type = 'id';
          var {name, end} = consumeName(s, i + 1);
          token.hash = name;
          token.end = end;
          yield token;
          i = token.end;
        } else {
          yield {delim: '#', start: i, end: i + 1};
          ++i;
        }
        break;
      case '$':
        if (i + 1 < s.length && s[i + 1] === '=') {
          yield {suffix_match: null, start: i, end: i + 2};
          i += 2;
        } else {
          yield {delim: '$', start: i, end: i + 1};
          ++i;
        }
        break;
      case "'":
        var token = consumeString(s, i + 1, "'");
        yield token;
        i = token.end;
        break;
      case '(':
        yield {open_paren: null, start: i, end: i + 1};
        ++i;
        break;
      case ')':
        yield {close_paren: null, start: i, end: i + 1};
        ++i;
        break;
      case '*':
        if (i + 1 < s.length && s[i + 1] === '=') {
          yield {substring_match: null, start: i, end: i + 2};
          i += 2;
        } else {
          yield {delim: '*', start: i, end: i + 1};
          ++i;
        }
        break;
      case '+':
        if (isnumber(s, i + 1)) {
          var token = consumeNumeric(s, i);
          yield token;
          i = token.end;
        } else {
          yield {delim: '+', start: i, end: i + 1};
          ++i;
        }
        break;
      case ',':
        yield {comma: null, start: i, end: i + 1};
        ++i;
        break;
      case '-':
        if (isnumber(s, i + 1)) {
          var token = consumeNumeric(s, i);
          yield token;
          i = token.end;
        } else if (wouldStartId(s, i)) {
          var token = consumeIdentLike(s, i);
          yield token;
          i = token.end;
        } else if (i + 2 < s.length && s[i + 1] === '-' && s[i + 2] === '>') {
          yield {cdc: null, start: i, end: i + 3};
          i += 3;
        } else {
          yield {delim: '-', start: i, end: i + 1};
          ++i;
        }
        break;
      case '.':
        if (isnumber(s, i + 1)) {
          var token = consumeNumeric(s, i);
          yield token;
          i = token.end;
        } else {
          yield {delim: '.', start: i, end: i + 1};
          ++i;
        }
        break;
      case '/':
        if (i + 1 < s.length && s[i + 1] === '*') {
          i += 2;
          while (i + 1 < s.length && (s[i] !== '*' || s[i + 1] !== '/')) {
            ++i;
          }
          if (i + 1 === s.length) ++i; else i += 2;
        } else {
          yield {delim: '/', start: i, end: i + 1};
          ++i;
        }
        break;
      case ':':
        yield {colon: null, start: i, end: i + 1};
        ++i;
        break;
      case ';':
        yield {semicolon: null, start: i, end: i + 1};
        ++i;
        break;
      case '<':
        if (i + 3 < s.length && s[i + 1] === '!' && s[i + 2] === '-' && s[i + 3] === '-') {
          yield {cdo: null, start: i, end: i + 4};
          i += 4;
        } else {
          yield {delim: '<', start: i, end: i + 1};
        }
        break;
      case '@':
        if (wouldStartId(s, i + 1)) {
          var {name, end} = consumeName(s, i + 1);
          yield {at_keyword: name, start: i, end};
          i = end;
        } else {
          yield {delim: '@', start: i, end: i + 1};
        }
        break;
      case '[':
        yield {open_bracket: null, start: i, end: i + 1};
        ++i;
        break;
      case '\\':
        if (isescape(s, i)) {
          var token = consumeIdentLike(s, i);
          yield token;
          i = token.end;
        } else {
          yield {delim: '\\', start: i, end: i + 1};
        }
        break;
      case ']':
        yield {close_bracket: null, start: i, end: i + 1};
        ++i;
        break;
      case '^':
        if (i + 1 < s.length && s[i + 1] === '=') {
          yield {prefix_match: null, start: i, end: i + 2};
          i += 2;
        } else {
          yield {delim: '^', start: i, end: i + 1};
        }
        break;
      case '{':
        yield {open_brace: null, start: i, end: i + 1};
        ++i;
        break;
      case '}':
        yield {close_brace: null, start: i, end: i + 1};
        ++i;
        break;
      case 'U':
      case 'u':
        if (i + 2 < s.length && s[i + 1] === '+' &&
            (s[i + 2] === '?' || isxdigit(s[i + 2]))) {
          i += 2;
          var token = consumeUnicodeRange(s, i);
          yield token;
          i = token.end;
        } else {
          var token = consumeIdentLike(s, i);
          yield token;
          i = token.end;
        }
        break;
      case '|':
        if (i + 1 < s.length && s[i + 1] === '=') {
          yield {dash_match: null, start: i, end: i + 2};
          i += 2;
        } else if (i + 1 < s.length && s[i + 1] === '|') {
          yield {column: null, start: i, end: i + 2};
          i += 2;
        } else {
          yield {delim: '|', start: i, end: i + 1};
          ++i;
        }
        break;
      case '~':
        if (i + 1 < s.length && s[i + 1] === '=') {
          yield {include_match: null, start: i, end: i + 2};
          i += 2;
        } else {
          yield {delim: '~', start: i, end: i + 1};
          ++i;
        }
        break;
      default:
        if (iswhite(s[i])) {
          var token = consumeWhitespace(s, i);
          yield token;
          i = token.end;
        } else if (isdigit(s[i])) {
          var token = consumeNumeric(s, i);
          yield token;
          i = token.end;
        } else if (isnamestart(s[i])) {
          var token = consumeIdentLike(s, i);
          yield token;
          i = token.end;
        } else {
          yield {delim: s[i], start: i, end: i + 1};
          ++i;
        }
    }
    if (i === here) {
      console.error('looped at', i, s.substr(i));
      return;
    }
  }
  yield {eof: null, start: i, end: i};
}


// Parser helper functions accept the current `token`
// and a Generator of the rest of `tokens`.

function next(tokens) {
  var result = tokens.next();
  //console.log(result);
  return result;
}

function consumeFunction(token, tokens) {
  var func = {function: {name: token.value.function, value: []}};
  for (token = next(tokens); !('eof' in token.value || 'close_paren' in token.value);
       token = next(tokens)) {
    var value = consumeComponentValue(token, tokens);
    func.function.value.push(value);
  }
  return func;
}

function consumeComponentValue(token, tokens) {
  if ('open_brace' in token.value ||
      'open_bracket' in token.value ||
      'open_paren' in token.value) {
    return consumeSimpleBlock(token, tokens);
  }
  if ('function' in token.value) {
    return consumeFunction(token, tokens);
  }
  return token.value;
}

function consumeSimpleBlock(token, tokens) {
  var ending = ('open_brace' in token.value ? 'close_brace' :
                'open_bracket' in token.value ? 'close_bracket' :
                'open_paren' in token.value ? 'close_paren' : undefined);
  var block = {simple_block: [], associated: token.value};
  for (token = next(tokens); !('eof' in token.value || ending in token.value);
       token = next(tokens)) {
    var value = consumeComponentValue(token, tokens);
    block.simple_block.push(value);
  }
  block.close = token.value;
  return block;
}

function consumeQualifiedRule(token, tokens) {
  var qrule = {prelude: []};
  for (token = token || next(tokens); !('eof' in token.value); token = next(tokens)) {
    if ('open_brace' in token.value) {
      var block = consumeSimpleBlock(token, tokens);
      qrule.block = block;
      return {qrule};
    } else if ('simple_block' in token.value && 'open_brace' in token.value.associated) {
      // TODO: how does this happen?
      qrule.block = token.value.simple_block;
      return {qrule};
    } else {
      var value = consumeComponentValue(token, tokens);
      qrule.prelude.push(value);
    }
  }
  return undefined;
}

function consumeAtRule(token, tokens) {
  var at_rule = {name: token.value.at_keyword, prelude: []};
  for (token = next(tokens); !('eof' in token.value || 'semicolon' in token.value);
       token = next(tokens)) {
    if ('open_brace' in token.value) {
      var block = consumeSimpleBlock(token, tokens);
      at_rule.block = block;
      return {at_rule};
    } else if ('simple_block' in token.value && 'open_brace' in token.value.associated) {
      // TODO: how does this happen?
      at_rule.block = token.value.simple_block;
      return {at_rule};
    } else {
      var value = consumeComponentValue(token, tokens);
      at_rule.prelude.push(value);
    }
  }
  return {at_rule};
}

function consumeListOfRules(tokens, toplevel) {
  var rules = [];
  for (var token = next(tokens); !('eof' in token.value); token = next(tokens)) {
    if ('whitespace' in token.value) {
      // do nothing
    } else if (('cdo' in token.value || 'cdc' in token.value) && !toplevel) {
      var qrule = consumeQualifiedRule(token, tokens);
      if (qrule) rules.push(qrule);
    } else if ('at_keyword' in token.value) {
      var at_rule = consumeAtRule(token, tokens);
      if (at_rule) rules.push(at_rule);
    } else {
      var qrule = consumeQualifiedRule(token, tokens);
      if (qrule) rules.push(qrule);
    }
  }
  return rules;
}

function parseStylesheet(tokens) {
  return {rules: consumeListOfRules(tokens, true)};
}

///////////////////////////////////////////////////////////////////////

function serialize(s) {
  function serialize_(o) {
    if (o === undefined) return '';
    if (o instanceof Array) return ''.concat(...o.map(serialize_));
    if ('rules' in o) return serialize_(o.rules);
    if ('at_rule' in o) {
      return `@${o.at_rule.name}${serialize_(o.at_rule.prelude)}${serialize_(o.at_rule.block)}`;
    }
    if ('qrule' in o) {
      return `${serialize_(o.qrule.prelude)}${serialize_(o.qrule.block)}`;
    }
    if ('simple_block' in o) {
      return `${serialize_(o.associated)}${serialize_(o.simple_block)}${serialize_(o.close)}`;
    }
    if ('function' in o) return `${o.function.name}(${serialize_(o.function.value)})`;
    if ('start' in o && 'end' in o) return s.substring(o.start, o.end);
  }
  return serialize_;
}

// Turn a string or an unquoted string into a string.
function toString(s, value) {
  if (value.length === 0) return "";
  var start = 'whitespace' in value[0] ? 1 : 0,
      end = 'whitespace' in value[value.length - 1] ? value.length - 1 : value.length;
  if (start >= end) return "";
  if (start + 1 === end && 'string' in value[start]) return value[start].string;
  return serialize(s)(value.slice(start, end));
}

// Convert a @-moz-document rule into a data structure for use in the extension.
function parseSection(s, rule) {
  var result = {
    code: serialize(s)(rule.block.simple_block),
    urls: rule.prelude.filter(item => 'url' in item).map(item => item.url)
  };
  [[/url-prefix/i, 'urlPrefixes'],
   [/domain/i, 'domains'],
   [/regexp/i, 'regexps']]
  .forEach(([re, key]) => {
    result[key] = 
       rule.prelude.filter(item => 'function' in item && re.test(item.function.name))
       .map(item => toString(s, item.function.value))
  });
  return result;
}

// Given a CSS stylesheet source string `s`,
// return an array of sections corresponding to each @-moz-document rule.
// Put global rules (if any) into a section with no conditions.
function split(s) {
  //console.log(s);
  //console.log(Array.from(tokens(s)));
  var parsed = parseStylesheet(tokens(s));
  //console.log(parsed);
  var sections = [];
  var global = parsed.rules.filter(
      rule => !('at_rule' in rule && /^-moz-document$/i.test(rule.at_rule.name)));
  if (global.length) {
    sections.push({
      urls: [], urlPrefixes: [], domains: [], regexps: [],
      code: serialize(s)(global)
    });
  }
  return sections.concat(
    parsed.rules
    .filter(rule => 'at_rule' in rule && /^-moz-document$/i.test(rule.at_rule.name))
    .map(rule => parseSection(s, rule.at_rule))
  );
}

/*
var s = `body { background: #c0ffee }
@-moz-document
url(about:blank),
url("quoted:url"),
url-prefix(http://),
url-prefix("https://"),
domain(google.com) {
[id=foo] { color: #ba2 }
body { background: #f00 }
}`;
//Array.from(tokens(s))
//parseStylesheet(tokens(s))
//serialize(s)(parseStylesheet(tokens(s)))
split(s)
*/

return split;

})();
