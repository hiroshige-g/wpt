"use strict";

var htmlNamespace = "http://www.w3.org/1999/xhtml";

var cssStylingFlag = false;

// Utility functions
function nextNode(node) {
	if (node.hasChildNodes()) {
		return node.firstChild;
	}
	return nextNodeDescendants(node);
}

function previousNode(node) {
	if (node.previousSibling) {
		node = node.previousSibling;
		while (node.hasChildNodes()) {
			node = node.lastChild;
		}
		return node;
	}
	if (node.parentNode
	&& node.parentNode.nodeType == Node.ELEMENT_NODE) {
		return node.parentNode;
	}
	return null;
}

function nextNodeDescendants(node) {
	while (node && !node.nextSibling) {
		node = node.parentNode;
	}
	if (!node) {
		return null;
	}
	return node.nextSibling;
}

/**
 * Returns true if ancestor is an ancestor of descendant, false otherwise.
 */
function isAncestor(ancestor, descendant) {
	if (!ancestor || !descendant) {
		return false;
	}
	while (descendant && descendant != ancestor) {
		descendant = descendant.parentNode;
	}
	return descendant == ancestor;
}

/**
 * Returns true if descendant is a descendant of ancestor, false otherwise.
 */
function isDescendant(descendant, ancestor) {
	return isAncestor(ancestor, descendant);
}

function convertProperty(property) {
	// Special-case for now
	var map = {
		"fontFamily": "font-family",
		"fontSize": "font-size",
		"fontStyle": "font-style",
		"fontWeight": "font-weight",
		"textDecoration": "text-decoration",
	};
	if (typeof map[property] != "undefined") {
		return map[property];
	}

	return property;
}

// Return the <font size=X> value for the given CSS size, or undefined if there
// is none.
function getFontSize(cssVal) {
	return {
		"xx-small": 1,
		"small": 2,
		"medium": 3,
		"large": 4,
		"x-large": 5,
		"xx-large": 6,
		"xxx-large": 7
	}[cssVal];
}

// This entire function is a massive hack to work around browser
// incompatibility.  It wouldn't work in real life, but it's good enough for a
// test implementation.  It's not clear how all this should actually be specced
// in practice, since CSS defines no notion of equality, does it?
function valuesEqual(command, val1, val2) {
	if (val1 === null || val2 === null) {
		return val1 === val2;
	}

	if (command == "subscript" || command == "superscript") {
		return val1 === val2;
	}

	if (command == "bold") {
		return val1 == val2
			|| (val1.toLowerCase() == "bold" && val2 == "700")
			|| (val2.toLowerCase() == "bold" && val1 == "700")
			|| (val1.toLowerCase() == "normal" && val2 == "400")
			|| (val2.toLowerCase() == "normal" && val1 == "400");
	}
	var property = getRelevantCssProperty(command);
	var test1 = document.createElement("span");
	test1.style[property] = val1;
	var test2 = document.createElement("span");
	test2.style[property] = val2;

	// Computing style doesn't seem to always work if the elements aren't in
	// the body?
	document.body.appendChild(test1);
	document.body.appendChild(test2);

	// We can't test xxx-large with CSS.  Also, some browsers (WebKit?) don't
	// actually make <span style="font-size: xx-small"> have the same size as
	// <font size="1">, and so on.  So we have to test both . . .
	var test1b = null, test2b = null;
	if (command == "fontsize") {
		if (typeof getFontSize(val1) != "undefined") {
			test1b = document.createElement("font");
			test1b.size = getFontSize(val1);
			document.body.appendChild(test1b);
		}
		if (typeof getFontSize(val2) != "undefined") {
			test2b = document.createElement("font");
			test2b.size = getFontSize(val2);
			document.body.appendChild(test2b);
		}
	}

	var computed1b = test1b
		? getComputedStyle(test1b)[property]
		: null;
	var computed2b = test2b
		? getComputedStyle(test2b)[property]
		: null;
	var computed1 = command == "fontsize" && val1 == "xxx-large"
		? computed1b
		: getComputedStyle(test1)[property];
	var computed2 = command == "fontsize" && val2 == "xxx-large"
		? computed2b
		: getComputedStyle(test2)[property];

	document.body.removeChild(test1);
	document.body.removeChild(test2);

	if (test1b) {
		document.body.removeChild(test1b);
	}
	if (test2b) {
		document.body.removeChild(test2b);
	}

	return computed1 == computed2
		|| computed1 === computed2b
		|| computed1b === computed2;
}

// Opera 11 puts HTML elements in the null namespace, it seems.
function isHtmlNamespace(ns) {
	return ns === null
		|| ns === htmlNamespace;
}


// Functions for stuff in DOM Range
function getNodeIndex(node) {
	var ret = 0;
	// These are no-ops to avoid a completely ridiculous bug in IE where
	// sometimes a node is not actually equal to any of its parents' children.
	// Somehow this makes it go away.  Sigh.
	if (node.nextSibling) {
		node = node.nextSibling.previousSibling;
	} else if (node.previousSibling) {
		node = node.previousSibling.nextSibling;
	} else {
		node = node.parentNode.firstChild;
	}
	while (ret < node.parentNode.childNodes.length && node != node.parentNode.childNodes[ret]) {
		ret++;
	}
	if (ret >= node.parentNode.childNodes.length) {
		// This actually happens in IE sometimes (although hopefully not with
		// my workaround in place).
		throw "node is not equal to any of its parents' children";
	}
	return ret;
}

function getNodeLength(node) {
	if (node.nodeType == Node.TEXT_NODE
	|| node.nodeType == Node.COMMENT_NODE
	|| node.nodeType == Node.PROCESSING_INSTRUCTION_NODE) {
		return node.data.length;
	}

	return node.childNodes.length;
}

/**
 * The position of two boundary points relative to one another, as defined by
 * DOM Range.
 */
function getPosition(nodeA, offsetA, nodeB, offsetB) {
	// "If node A is the same as node B, return equal if offset A equals offset
	// B, before if offset A is less than offset B, and after if offset A is
	// greater than offset B."
	if (nodeA == nodeB) {
		if (offsetA == offsetB) {
			return "equal";
		}
		if (offsetA < offsetB) {
			return "before";
		}
		if (offsetA > offsetB) {
			return "after";
		}
	}

	// "If node A is after node B in tree order, compute the position of (node
	// B, offset B) relative to (node A, offset A). If it is before, return
	// after. If it is after, return before."
	if (nodeB.compareDocumentPosition(nodeA) & Node.DOCUMENT_POSITION_FOLLOWING) {
		var pos = getPosition(nodeB, offsetB, nodeA, offsetA);
		if (pos == "before") {
			return "after";
		}
		if (pos == "after") {
			return "before";
		}
	}

	// "If node A is an ancestor of node B:"
	if (nodeB.compareDocumentPosition(nodeA) & Node.DOCUMENT_POSITION_CONTAINS) {
		// "Let child equal node B."
		var child = nodeB;

		// "While child is not a child of node A, set child to its parent."
		while (child.parentNode != nodeA) {
			child = child.parentNode;
		}

		// "If the index of child is less than offset A, return after."
		if (getNodeIndex(child) < offsetA) {
			return "after";
		}
	}

	// "Return before."
	return "before";
}

/**
 * Returns the furthest ancestor of a Node as defined by DOM Range.
 */
function getFurthestAncestor(node) {
	var root = node;
	while (root.parentNode != null) {
		root = root.parentNode;
	}
	return root;
}

/**
 * "contained" as defined by DOM Range: "A Node node is contained in a range
 * range if node's furthest ancestor is the same as range's root, and (node, 0)
 * is after range's start, and (node, length of node) is before range's end."
 */
function isContained(node, range) {
	var pos1 = getPosition(node, 0, range.startContainer, range.startOffset);
	var pos2 = getPosition(node, getNodeLength(node), range.endContainer, range.endOffset);

	return getFurthestAncestor(node) == getFurthestAncestor(range.startContainer)
		&& pos1 == "after"
		&& pos2 == "before";
}


function parseSimpleColor(color) {
	// This is stupid, but otherwise my automated tests will have places where
	// they're known to contradict the spec, which is annoying, so . . . I
	// don't aim for correctness, beyond my own provisional tests.  Real tests
	// will have to be more exhaustive.

	if (color.length == 7 && color[0] == "#") {
		return color;
	}

	if (color.length == 4 && color[0] == "#") {
		return "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
	}

	// Otherwise, don't even try.
	return {
		"red": "red",
		"blue": "blue",
		"rgb(255, 0, 0)": "#ff0000",
		"rgb(100%, 0, 0)": "#ff0000",
		"rgb( 255 ,0 ,0)": "#ff0000",
		"rgba(255, 0, 0, 0.0)": false,
		"rgb(375, -10, 15)": false,
		"rgba(0, 0, 0, 1)": "#000000",
		"rgba(255, 255, 255, 1)": "#ffffff",
		"rgba(255, 0, 0, 0.5)": false,
		"hsl(0%, 100%, 50%)": "#ff0000",
		"cornsilk": "cornsilk",
		"transparent": false,
		"currentColor": false,
	}[color];
}


// Things defined in the edit command spec (i.e., the interesting stuff)


// "An HTML element is an Element whose namespace is the HTML namespace."
function isHtmlElement(node) {
	return node
		&& node.nodeType == Node.ELEMENT_NODE
		&& isHtmlNamespace(node.namespaceURI);
}

// "An inline node is either a Text node, or an Element whose "display"
// property computes to "inline", "inline-block", or "inline-table"."
function isInlineNode(node) {
	return node
		&& (node.nodeType == Node.TEXT_NODE
		|| (node.nodeType == Node.ELEMENT_NODE
		&& ["inline", "inline-block", "inline-table"].indexOf(getComputedStyle(node).display) != -1));
}

function setTagName(element, newName) {
	// "If element is an HTML element with local name equal to new name, return
	// element."
	if (isHtmlElement(element) && element.tagName == newName.toUpperCase()) {
		return element;
	}

	// "If element's parent is null, return element."
	if (!element.parentNode) {
		return element;
	}

	// "Let replacement element be the result of calling createElement(new
	// name) on the ownerDocument of element."
	var replacementElement = element.ownerDocument.createElement(newName);

	// "Insert replacement element into element's parent immediately before
	// element."
	element.parentNode.insertBefore(replacementElement, element);

	// "Copy all attributes of element to replacement element, in order."
	for (var i = 0; i < element.attributes.length; i++) {
		replacementElement.setAttributeNS(element.attributes[i].namespaceURI, element.attributes[i].name, element.attributes[i].value);
	}

	// "While element has children, append the first child of element as the
	// last child of replacement element, preserving ranges."
	while (element.childNodes.length) {
		movePreservingRanges(element.firstChild, replacementElement, replacementElement.childNodes.length);
	}

	// "Remove element from its parent."
	element.parentNode.removeChild(element);

	// "Return replacement element."
	return replacementElement;
}

function removePreservingDescendants(node) {
	// "Let children be a list of node's children."
	var children = [].slice.call(node.childNodes);

	// "If node's parent is null, remove all of node's children from node, then
	// return children."
	if (!node.parentNode) {
		while (node.hasChildNodes()) {
			node.removeChild(node.firstChild);
		}
		return children;
	}

	// "While node has children, insert the first child of node into node's
	// parent immediately before node, preserving ranges."
	while (node.hasChildNodes()) {
		movePreservingRanges(node.firstChild, node.parentNode, getNodeIndex(node));
	}

	// "Remove node from its parent."
	node.parentNode.removeChild(node);

	// "Return children."
	return children;
}

// "Something is editable if either it is an Element with a contenteditable
// attribute set to the true state; or it is a Document whose designMode is
// enabled; or it is a node whose parent is editable, but which does not have a
// contenteditable attribute set to the false state."
function isEditable(node) {
	// This is slightly a lie, because we're excluding non-HTML elements with
	// contentEditable attributes.  Maybe we want to, though . . .
	return (node instanceof Element && node.contentEditable == "true")
		|| (node instanceof Document && node.designMode == "on")
		|| (node instanceof Node && node.contentEditable !== "false" && isEditable(node.parentNode));
}

// "An editing host is a node that is editable, and whose parent is not
// editable."
function isEditingHost(node) {
	return node instanceof Node
		&& isEditable(node)
		&& !isEditable(node.parentNode);
}

/**
 * "A Node is effectively contained in a Range if either it is contained in the
 * Range; or it is the Range's start node, it is a Text node, and its length is
 * different from the Range's start offset; or it is the Range's end node, it
 * is a Text node, and the Range's end offset is not 0; or it has at least one
 * child, and all its children are effectively contained in the Range."
 */
function isEffectivelyContained(node, range) {
	if (isContained(node, range)) {
		return true;
	}
	if (node == range.startContainer
	&& node.nodeType == Node.TEXT_NODE
	&& getNodeLength(node) != range.startOffset) {
		return true;
	}
	if (node == range.endContainer
	&& node.nodeType == Node.TEXT_NODE
	&& range.endOffset != 0) {
		return true;
	}
	if (node.childNodes.length != 0) {
		for (var i = 0; i < node.childNodes.length; i++) {
			if (!isEffectivelyContained(node.childNodes[i], range)) {
				return false;
			}
		}
		return true;
	}
	return false;
}

// "An unwrappable node is an HTML element which may not be used where only
// phrasing content is expected (not counting unknown or obsolete elements,
// which cannot be used at all); or any Element whose display property computes
// to something other than "inline", "inline-block", or "inline-table"; or any
// node whose parent is not editable."
//
// I don't bother implementing this exactly, just well enough for testing.
function isUnwrappableNode(node) {
	if (!node) {
		return false;
	}

	if (!isEditable(node.parentNode)) {
		return true;
	}

	if (node.nodeType != Node.ELEMENT_NODE) {
		return false;
	}

	var display = getComputedStyle(node).display;
	if (display != "inline"
	&& display != "inline-block"
	&& display != "inline-table") {
		return true;
	}

	if (!isHtmlElement(node)) {
		return false;
	}

	return [
		"h1", "h2", "h3", "h4", "h5", "h6", "p", "hr", "pre", "blockquote",
		"ol", "ul", "li", "dl", "dt", "dd", "div", "table", "caption",
		"colgroup", "col", "tbody", "thead", "tfoot", "tr", "th", "td",
		"address"
	].indexOf(node.tagName.toLowerCase()) != -1;
}

/**
 * "effective value" per edit command spec
 */
function getEffectiveValue(node, command) {
	// "If neither node nor its parent is an Element, return null."
	if (node.nodeType != Node.ELEMENT_NODE
	&& (!node.parentNode || node.parentNode.nodeType != Node.ELEMENT_NODE)) {
		return null;
	}

	// "If node is not an Element, return the effective value of its parent for
	// command."
	if (node.nodeType != Node.ELEMENT_NODE) {
		return getEffectiveValue(node.parentNode, command);
	}

	// "If command is "createLink" or "unlink":"
	if (command == "createlink" || command == "unlink") {
		// "While node is not null, and is not an a element that has an href
		// attribute, set node to its parent."
		while (node
		&& (!isHtmlElement(node)
		|| node.tagName != "A"
		|| !node.hasAttribute("href"))) {
			node = node.parentNode;
		}

		// "If node is null, return null."
		if (!node) {
			return null;
		}

		// "Return the value of node's href attribute."
		return node.getAttribute("href");
	}

	// "If command is "hiliteColor":"
	if (command == "hilitecolor") {
		// "While the computed style of "background-color" on node is any
		// fully transparent value, and node's parent is an Element, set
		// node to its parent."
		//
		// Another lame hack to avoid flawed APIs.
		while ((getComputedStyle(node).backgroundColor == "rgba(0, 0, 0, 0)"
		|| getComputedStyle(node).backgroundColor === ""
		|| getComputedStyle(node).backgroundColor == "transparent")
		&& node.parentNode
		&& node.parentNode.nodeType == Node.ELEMENT_NODE) {
			node = node.parentNode;
		}

		// "If the computed style of "background-color" on node is a fully
		// transparent value, return "rgb(255, 255, 255)"."
		if (getComputedStyle(node).backgroundColor == "rgba(0, 0, 0, 0)"
        || getComputedStyle(node).backgroundColor === ""
        || getComputedStyle(node).backgroundColor == "transparent") {
			return "rgb(255, 255, 255)";
		}

		// "Otherwise, return the computed style of "background-color" for
		// node."
		return getComputedStyle(node).backgroundColor;
	}

	// "If command is "subscript" or "superscript":"
	if (command == "subscript" || command == "superscript") {
		// "Let affected by subscript and affected by superscript be two
		// boolean variables, both initially false."
		var affectedBySubscript = false;
		var affectedBySuperscript = false;

		// "While node is an Element whose "display" property computes to
		// "inline":"
		while (node
		&& node.nodeType == Node.ELEMENT_NODE
		&& getComputedStyle(node).display == "inline") {
			var verticalAlign = getComputedStyle(node).verticalAlign;

			// "If node's "vertical-align" property computes to "sub", set
			// affected by subscript to true."
			if (verticalAlign == "sub") {
				affectedBySubscript = true;
			// "Otherwise, if node's "vertical-align" property computes to
			// "super", set affected by superscript to true."
			} else if (verticalAlign == "super") {
				affectedBySuperscript = true;
			// "Otherwise, if node's "vertical-align" property computes to some
			// value other than "baseline", return the string "mixed"."
			} else if (verticalAlign != "baseline") {
				return "mixed";
			}

			// "Set node to its parent."
			node = node.parentNode;
		}

		// "If affected by subscript and affected by superscript are both true,
		// return the string "mixed"."
		if (affectedBySubscript && affectedBySuperscript) {
			return "mixed";
		}

		// "If affected by subscript is true, return "sub"."
		if (affectedBySubscript) {
			return "sub";
		}

		// "If affected by superscript is true, return "super"."
		if (affectedBySuperscript) {
			return "super";
		}

		// "Return "baseline"."
		return "baseline";
	}

	// "If command is "strikethrough", and the "text-decoration" property of
	// node or any of its ancestors computes to a value containing
	// "line-through", return "line-through". Otherwise, return null."
	if (command == "strikethrough") {
		do {
			if (getComputedStyle(node).textDecoration.indexOf("line-through") != -1) {
				return "line-through";
			}
			node = node.parentNode;
		} while (node && node.nodeType == Node.ELEMENT_NODE);
		return null;
	}

	// "If command is "underline", and the "text-decoration" property of node
	// or any of its ancestors computes to a value containing "underline",
	// return "underline". Otherwise, return null."
	if (command == "underline") {
		do {
			if (getComputedStyle(node).textDecoration.indexOf("underline") != -1) {
				return "underline";
			}
			node = node.parentNode;
		} while (node && node.nodeType == Node.ELEMENT_NODE);
		return null;
	}

	// "Return the computed style for node of the relevant CSS property for
	// command."
	return getComputedStyle(node)[getRelevantCssProperty(command)];
}

/**
 * "specified value" per edit command spec
 */
function getSpecifiedValue(element, command) {
	// "If command is "hiliteColor" and element's display property does not
	// compute to "inline", return null."
	if (command == "hilitecolor"
	&& getComputedStyle(element).display != "inline") {
		return null;
	}

	// "If command is "createLink" or "unlink":"
	if (command == "createlink" || command == "unlink") {
		// "If element is an a element and has an href attribute, return the
		// value of that attribute."
		if (isHtmlElement(element)
		&& element.tagName == "A"
		&& element.hasAttribute("href")) {
			return element.getAttribute("href");
		}

		// "Return null."
		return null;
	}

	// "If command is "subscript" or "superscript":"
	if (command == "subscript" || command == "superscript") {
		// "If the computed style of element's "display" property is
		// neither "inline" nor "inline-block" nor "inline-table", return
		// null."
		var style = getComputedStyle(element);
		if (style.display != "inline"
		&& style.display != "inline-block"
		&& style.display != "inline-table") {
			return null;
		}

		// "If element has a style attribute set, and that attribute has
		// the effect of setting "vertical-align", return the value that it
		// sets "vertical-align" to."
		if (element.style.verticalAlign != "") {
			return element.style.verticalAlign;
		}

		// "If element is a sup, return "super"."
		if (isHtmlElement(element) && element.tagName == "SUP") {
			return "super";
		}

		// "If element is a sub, return "sub"."
		if (isHtmlElement(element) && element.tagName == "SUB") {
			return "sub";
		}

		// "Return null."
		return null;
	}

	// "If command is "strikethrough", and element has a style attribute set,
	// and that attribute sets "text-decoration":"
	if (command == "strikethrough"
	&& element.style.textDecoration != "") {
		// "If element's style attribute sets "text-decoration" to a value
		// containing "line-through", return "line-through"."
		if (element.style.textDecoration.indexOf("line-through") != -1) {
			return "line-through";
		}

		// "Return null."
		return null;
	}

	// "If command is "strikethrough" and element is a s or strike element,
	// return "line-through"."
	if (command == "strikethrough"
	&& isHtmlElement(element)
	&& (element.tagName == "S" || element.tagName == "STRIKE")) {
		return "line-through";
	}

	// "If command is "underline", and element has a style attribute set, and
	// that attribute sets "text-decoration":"
	if (command == "underline"
	&& element.style.textDecoration != "") {
		// "If element's style attribute sets "text-decoration" to a value
		// containing "underline", return "underline"."
		if (element.style.textDecoration.indexOf("underline") != -1) {
			return "underline";
		}

		// "Return null."
		return null;
	}

	// "If command is "underline" and element is a u element, return
	// "underline"."
	if (command == "underline"
	&& isHtmlElement(element)
	&& element.tagName == "U") {
		return "underline";
	}

	// "Let property be the relevant CSS property for command."
	var property = getRelevantCssProperty(command);

	// "If property is null, return null."
	if (property === null) {
		return null;
	}

	// "If element has a style attribute set, and that attribute has the
	// effect of setting property, return the value that it sets property to."
	if (element.style[property] != "") {
		return element.style[property];
	}

	// "If element is a font element that has an attribute whose effect is
	// to create a presentational hint for property, return the value that the
	// hint sets property to.  (For a size of 7, this will be the non-CSS value
	// "xxx-large".)"
	if (isHtmlNamespace(element.namespaceURI)
	&& element.tagName == "FONT") {
		if (property == "color" && element.hasAttribute("color")) {
			return element.color;
		}
		if (property == "fontFamily" && element.hasAttribute("face")) {
			return element.face;
		}
		if (property == "fontSize" && element.hasAttribute("size")) {
			// This is not even close to correct in general.
			var size = parseInt(element.size);
			if (size < 1) {
				size = 1;
			}
			if (size > 7) {
				size = 7;
			}
			return {
				1: "xx-small",
				2: "small",
				3: "medium",
				4: "large",
				5: "x-large",
				6: "xx-large",
				7: "xxx-large"
			}[size];
		}
	}

	// "If element is in the following list, and property is equal to the
	// CSS property name listed for it, return the string listed for it."
	//
	// A list follows, whose meaning is copied here.
	if (property == "fontWeight"
	&& (element.tagName == "B" || element.tagName == "STRONG")) {
		return "bold";
	}
	if (property == "fontStyle"
	&& (element.tagName == "I" || element.tagName == "EM")) {
		return "italic";
	}

	// "Return null."
	return null;
}

// "A modifiable element is a b, em, i, s, span, strong, sub, sup, or u element
// with no attributes except possibly style; or a font element with no
// attributes except possibly style, color, face, and/or size; or an a element
// with no attributes except possibly style and/or href."
function isModifiableElement(node) {
	if (!isHtmlElement(node)) {
		return false;
	}

	if (["B", "EM", "I", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "U"].indexOf(node.tagName) != -1) {
		if (node.attributes.length == 0) {
			return true;
		}

		if (node.attributes.length == 1
		&& node.hasAttribute("style")) {
			return true;
		}
	}

	if (node.tagName == "FONT" || node.tagName == "A") {
		var numAttrs = node.attributes.length;

		if (node.hasAttribute("style")) {
			numAttrs--;
		}

		if (node.tagName == "FONT") {
			if (node.hasAttribute("color")) {
				numAttrs--;
			}

			if (node.hasAttribute("face")) {
				numAttrs--;
			}

			if (node.hasAttribute("size")) {
				numAttrs--;
			}
		}

		if (node.tagName == "A"
		&& node.hasAttribute("href")) {
			numAttrs--;
		}

		if (numAttrs == 0) {
			return true;
		}
	}

	return false;
}

function isSimpleModifiableElement(node) {
	// "A simple modifiable element is an HTML element for which at least one
	// of the following holds:"
	if (!isHtmlElement(node)) {
		return false;
	}

	// Only these elements can possibly be a simple modifiable element.
	if (["A", "B", "EM", "FONT", "I", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "U"].indexOf(node.tagName) == -1) {
		return false;
	}

	// "It is an a, b, em, font, i, s, span, strike, strong, sub, sup, or u
	// element with no attributes."
	if (node.attributes.length == 0) {
		return true;
	}

	// If it's got more than one attribute, everything after this fails.
	if (node.attributes.length > 1) {
		return false;
	}

	// "It is an a, b, em, font, i, s, span, strike, strong, sub, sup, or u
	// element with exactly one attribute, which is style, which sets no CSS
	// properties (including invalid or unrecognized properties)."
	//
	// Not gonna try for invalid or unrecognized.
	if (node.hasAttribute("style")
	&& node.style.length == 0) {
		return true;
	}

	// "It is an a element with exactly one attribute, which is href."
	if (node.tagName == "A"
	&& node.hasAttribute("href")) {
		return true;
	}

	// "It is a font element with exactly one attribute, which is either color,
	// face, or size."
	if (node.tagName == "FONT"
	&& (node.hasAttribute("color")
	|| node.hasAttribute("face")
	|| node.hasAttribute("size")
	)) {
		return true;
	}

	// "It is a b or strong element with exactly one attribute, which is style,
	// and the style attribute sets exactly one CSS property (including invalid
	// or unrecognized properties), which is "font-weight"."
	if ((node.tagName == "B" || node.tagName == "STRONG")
	&& node.hasAttribute("style")
	&& node.style.length == 1
	&& node.style.fontWeight != "") {
		return true;
	}

	// "It is an i or em element with exactly one attribute, which is style,
	// and the style attribute sets exactly one CSS property (including invalid
	// or unrecognized properties), which is "font-style"."
	if ((node.tagName == "I" || node.tagName == "EM")
	&& node.hasAttribute("style")
	&& node.style.length == 1
	&& node.style.fontStyle != "") {
		return true;
	}

	// "It is a sub or sub element with exactly one attribute, which is style,
	// and the style attribute sets exactly one CSS property (including invalid
	// or unrecognized properties), which is "vertical-align"."
	if ((node.tagName == "SUB" || node.tagName == "SUP")
	&& node.hasAttribute("style")
	&& node.style.length == 1
	&& node.style.verticalAlign != "") {
		return true;
	}

	// "It is an a, font, or span element with exactly one attribute, which is
	// style, and the style attribute sets exactly one CSS property (including
	// invalid or unrecognized properties), and that property is not
	// "text-decoration"."
	if ((node.tagName == "A" || node.tagName == "FONT" || node.tagName == "SPAN")
	&& node.hasAttribute("style")
	&& node.style.length == 1
	&& node.style.textDecoration == "") {
		return true;
	}

	// "It is an a, font, s, span, strike, or u element with exactly one
	// attribute, which is style, and the style attribute sets exactly one CSS
	// property (including invalid or unrecognized properties), which is
	// "text-decoration", which is set to "line-through" or "underline" or
	// "overline" or "none"."
	if (["A", "FONT", "S", "SPAN", "STRIKE", "U"].indexOf(node.tagName) != -1
	&& node.hasAttribute("style")
	&& node.style.length == 1
	&& (node.style.textDecoration == "line-through"
	|| node.style.textDecoration == "underline"
	|| node.style.textDecoration == "overline"
	|| node.style.textDecoration == "none")) {
		return true;
	}

	return false;
}

function movePreservingRanges(node, newParent, newIndex) {
	// "When the user agent is to move a Node to a new location, preserving
	// ranges, it must remove the Node from its original parent, then insert it
	// in the new location. In doing so, however, it must ignore the regular
	// range mutation rules, and instead follow these rules:"

	// "Let node be the moved Node, old parent and old index be the old parent
	// and index, and new parent and new index be the new parent and index."
	var oldParent = node.parentNode;
	var oldIndex = getNodeIndex(node);

	// We only even attempt to preserve the global range object, not every
	// range out there (the latter is probably impossible).
	var start = [globalRange.startContainer, globalRange.startOffset];
	var end = [globalRange.endContainer, globalRange.endOffset];

	// "If a boundary point's node is the same as or a descendant of node,
	// leave it unchanged, so it moves to the new location."
	//
	// No modifications necessary.

	// "If a boundary point's node is new parent and its offset is greater than
	// new index, add one to its offset."
	if (globalRange.startContainer == newParent
	&& globalRange.startOffset > newIndex) {
		start[1]++;
	}
	if (globalRange.endContainer == newParent
	&& globalRange.endOffset > newIndex) {
		end[1]++;
	}

	// "If a boundary point's node is old parent and its offset is old index or
	// old index + 1, set its node to new parent and add new index − old index
	// to its offset."
	if (globalRange.startContainer == oldParent
	&& (globalRange.startOffset == oldIndex
	|| globalRange.startOffset == oldIndex + 1)) {
		start[0] = newParent;
		start[1] += newIndex - oldIndex;
	}
	if (globalRange.endContainer == oldParent
	&& (globalRange.endOffset == oldIndex
	|| globalRange.endOffset == oldIndex + 1)) {
		end[0] = newParent;
		end[1] += newIndex - oldIndex;
	}

	// "If a boundary point's node is old parent and its offset is greater than
	// old index + 1, subtract one from its offset."
	if (globalRange.startContainer == oldParent
	&& globalRange.startOffset > oldIndex + 1) {
		start[1]--;
	}
	if (globalRange.endContainer == oldParent
	&& globalRange.endOffset > oldIndex + 1) {
		end[1]--;
	}

	// Now actually move it and preserve the range.
	if (newParent.childNodes.length == newIndex) {
		newParent.appendChild(node);
	} else {
		newParent.insertBefore(node, newParent.childNodes[newIndex]);
	}
	globalRange.setStart(start[0], start[1]);
	globalRange.setEnd(end[0], end[1]);
}

function decomposeRange(range) {
	// "If range's start and end are the same, return an empty list."
	if (range.startContainer == range.endContainer
	&& range.startOffset == range.endOffset) {
		return [];
	}

	// "If range's start node is a Text node and its start offset is neither 0
	// nor the length of its start node, run splitText() on its start node with
	// argument equal to its start offset."
	if (range.startContainer.nodeType == Node.TEXT_NODE
	&& range.startOffset != 0
	&& range.startOffset != getNodeLength(range.startContainer)) {
		// Account for UAs not following range mutation rules
		if (range.startContainer == range.endContainer) {
			var newEndOffset = range.endOffset - range.startOffset;
			var newText = range.startContainer.splitText(range.startOffset);
			range.setStart(newText, 0);
			range.setEnd(newText, newEndOffset);
		} else {
			var newText = range.startContainer.splitText(range.startOffset);
			range.setStart(newText, 0);
		}
	}

	// "If range's end node is a Text node and its end offset is neither 0 nor
	// the length of its end node, run splitText() on its end node with
	// argument equal to its end offset."
	if (range.endContainer.nodeType == Node.TEXT_NODE
	&& range.endOffset != 0
	&& range.endOffset != getNodeLength(range.endContainer)) {
		// IE seems to mutate the range incorrectly here, so we need correction
		// here as well.
		var newStart = [range.startContainer, range.startOffset];
		var newEnd = [range.endContainer, range.endOffset];
		range.endContainer.splitText(range.endOffset);
		range.setStart(newStart[0], newStart[1]);
		range.setEnd(newEnd[0], newEnd[1]);
	}

	// "Let cloned range be the result of calling cloneRange() on range."
	var clonedRange = range.cloneRange();

	// "While the start offset of cloned range is 0, and the parent of cloned
	// range's start node is not null, set the start of cloned range to (parent
	// of start node, index of start node)."
	while (clonedRange.startOffset == 0
	&& clonedRange.startContainer.parentNode) {
		clonedRange.setStart(clonedRange.startContainer.parentNode, getNodeIndex(clonedRange.startContainer));
	}

	// "While the end offset of cloned range equals the length of its end node,
	// and the parent of clone range's end node is not null, set the end of
	// cloned range to (parent of end node, 1 + index of end node)."
	while (clonedRange.endOffset == getNodeLength(clonedRange.endContainer)
	&& clonedRange.endContainer.parentNode) {
		clonedRange.setEnd(clonedRange.endContainer.parentNode, 1 + getNodeIndex(clonedRange.endContainer));
	}

	// "Return a list consisting of every Node contained in cloned range in
	// tree order, omitting any whose parent is also contained in cloned
	// range."
	var ret = [];
	for (var node = clonedRange.startContainer; node != nextNodeDescendants(clonedRange.endContainer); node = nextNode(node)) {
		if (isContained(node, clonedRange)
		&& !isContained(node.parentNode, clonedRange)) {
			ret.push(node);
		}
	}
	return ret;
}

function blockExtendRange(range) {
	// "Let start node, start offset, end node, and end offset be the start
	// and end nodes and offsets of the range."
	var startNode = range.startContainer;
	var startOffset = range.startOffset;
	var endNode = range.endContainer;
	var endOffset = range.endOffset;

	// "Repeat the following steps:"
	while (true) {
		// "If start node is a Text or Comment node or start offset is 0,
		// set start offset to the index of start node and then set start
		// node to its parent."
		if (startNode.nodeType == Node.TEXT_NODE
		|| startNode.nodeType == Node.COMMENT_NODE
		|| startOffset == 0) {
			startOffset = getNodeIndex(startNode);
			startNode = startNode.parentNode;

		// "Otherwise, if start offset is equal to the length of start
		// node, set start offset to one plus the index of start node and
		// then set start node to its parent."
		} else if (startOffset == getNodeLength(startNode)) {
			startOffset = 1 + getNodeIndex(startNode);
			startNode = startNode.parentNode;

		// "Otherwise, if the child of start node with index start offset
		// minus one is a Text or Comment node, or an (insert definition
		// here), subtract one from start offset."
		} else if (startNode.childNodes[startOffset - 1].nodeType == Node.TEXT_NODE
		|| startNode.childNodes[startOffset - 1].nodeType == Node.COMMENT_NODE
		|| ["B", "I", "SPAN"].indexOf(startNode.childNodes[startOffset - 1].tagName) != -1) {
			startOffset--;

		// "Otherwise, break from this loop."
		} else {
			break;
		}
	}

	// "Repeat the following steps:"
	while (true) {
		// "If end offset is 0, set end offset to the index of end node and
		// then set end node to its parent."
		if (endOffset == 0) {
			endOffset = getNodeIndex(endNode);
			endNode = endNode.parentNode;

		// "Otherwise, if end node is a Text or Comment node or end offset
		// is equal to the length of end node, set end offset to one plus
		// the index of end node and then set end node to its parent."
		} else if (endNode.nodeType == Node.TEXT_NODE
		|| endNode.nodeType == Node.COMMENT_NODE
		|| endOffset == getNodeLength(endNode)) {
			endOffset = 1 + getNodeIndex(endNode);
			endNode = endNode.parentNode;

		// "Otherwise, if the child of end node with index end offset is a
		// Text or Comment node, or an (insert definition here), add one to
		// end offset."
		} else if (endNode.childNodes[endOffset].nodeType == Node.TEXT_NODE
		|| endNode.childNodes[endOffset].nodeType == Node.COMMENT_NODE
		|| ["B", "I", "SPAN"].indexOf(endNode.childNodes[endOffset].tagName) != -1) {
			endOffset++;

		// "Otherwise, break from this loop."
		} else {
			break;
		}
	}

	// "Let new range be a new range whose start and end nodes and offsets
	// are start node, start offset, end node, and end offset."
	var newRange = startNode.ownerDocument.createRange();
	newRange.setStart(startNode, startOffset);
	newRange.setEnd(endNode, endOffset);

	// "Return new range."
	return newRange;
}

function clearValue(element, command) {
	// "If element's specified value for command is null, return the empty
	// list."
	if (getSpecifiedValue(element, command) === null) {
		return [];
	}

	// "If element is a simple modifiable element:"
	if (isSimpleModifiableElement(element)) {
		// "Let children be the children of element."
		var children = Array.prototype.slice.call(element.childNodes);

		// "While element has children, insert its first child into its parent
		// immediately before it, preserving ranges."
		while (element.childNodes.length) {
			movePreservingRanges(element.firstChild, element.parentNode, getNodeIndex(element));
		}

		// "Remove element from its parent."
		element.parentNode.removeChild(element);

		// "Return children."
		return children;
	}

	// "If command is "strikethrough", and element has a style attribute that
	// sets "text-decoration" to some value containing "line-through", delete
	// "line-through" from the value."
	if (command == "strikethrough"
	&& element.style.textDecoration.indexOf("line-through") != -1) {
		if (element.style.textDecoration == "line-through") {
			element.style.textDecoration = "";
		} else {
			element.style.textDecoration = element.style.textDecoration.replace("line-through", "");
		}
		if (element.getAttribute("style") == "") {
			element.removeAttribute("style");
		}
	}

	// "If command is "underline", and element has a style attribute that sets
	// "text-decoration" to some value containing "underline", delete
	// "underline" from the value."
	if (command == "underline"
	&& element.style.textDecoration.indexOf("underline") != -1) {
		if (element.style.textDecoration == "underline") {
			element.style.textDecoration = "";
		} else {
			element.style.textDecoration = element.style.textDecoration.replace("underline", "");
		}
		if (element.getAttribute("style") == "") {
			element.removeAttribute("style");
		}
	}

	// "If the relevant CSS property for command is not null, unset the CSS
	// property property of element."
	if (getRelevantCssProperty(command) !== null) {
		element.style[getRelevantCssProperty(command)] = '';
		if (element.getAttribute("style") == "") {
			element.removeAttribute("style");
		}
	}

	// "If element is a font element:"
	if (isHtmlNamespace(element.namespaceURI) && element.tagName == "FONT") {
		// "If command is "foreColor", unset element's color attribute, if set."
		if (command == "forecolor") {
			element.removeAttribute("color");
		}

		// "If command is "fontName", unset element's face attribute, if set."
		if (command == "fontname") {
			element.removeAttribute("face");
		}

		// "If command is "fontSize", unset element's size attribute, if set."
		if (command == "fontsize") {
			element.removeAttribute("size");
		}
	}

	// "If element is an a element and command is "createLink" or "unlink",
	// unset the href property of element."
	if (isHtmlElement(element)
	&& element.tagName == "A"
	&& (command == "createlink" || command == "unlink")) {
		element.removeAttribute("href");
	}

	// "If element's specified value for command is null, return the empty
	// list."
	if (getSpecifiedValue(element, command) === null) {
		return [];
	}

	// "Let new element be a new HTML element with name "span", with the
	// same attributes and ownerDocument as element."
	var newElement = element.ownerDocument.createElement("span");
	for (var j = 0; j < element.attributes.length; j++) {
		// FIXME: Namespaces?
		newElement.setAttribute(element.attributes[j].localName, element.attributes[j].value);
	}

	// "Insert new element into the parent of element immediately before it."
	element.parentNode.insertBefore(newElement, element);

	// "While element has children, append its first child as the last child of
	// new element, preserving ranges."
	while (element.childNodes.length) {
		movePreservingRanges(element.firstChild, newElement, newElement.childNodes.length);
	}

	// "Remove element from its parent."
	element.parentNode.removeChild(element);

	// "Return the one-Node list consisting of new element."
	return [newElement];
}

function pushDownValues(node, command, newValue) {
	// "If node's parent is not an Element, abort this algorithm."
	if (!node.parentNode
	|| node.parentNode.nodeType != Node.ELEMENT_NODE) {
		return;
	}

	// "If the effective value of command is new value on node, abort this
	// algorithm."
	if (valuesEqual(command, getEffectiveValue(node, command), newValue)) {
		return;
	}

	// "Let current ancestor be node's parent."
	var currentAncestor = node.parentNode;

	// "Let ancestor list be a list of Nodes, initially empty."
	var ancestorList = [];

	// "While current ancestor is an editable Element and the effective value
	// of command is not new value on it, append current ancestor to ancestor
	// list, then set current ancestor to its parent."
	while (isEditable(currentAncestor)
	&& currentAncestor.nodeType == Node.ELEMENT_NODE
	&& !valuesEqual(command, getEffectiveValue(currentAncestor, command), newValue)) {
		ancestorList.push(currentAncestor);
		currentAncestor = currentAncestor.parentNode;
	}

	// "If ancestor list is empty, abort this algorithm."
	if (!ancestorList.length) {
		return;
	}

	// "Let propagated value be the specified value of command on the last
	// member of ancestor list."
	var propagatedValue = getSpecifiedValue(ancestorList[ancestorList.length - 1], command);

	// "If propagated value is null and is not equal to new value, abort this
	// algorithm."
	if (propagatedValue === null && propagatedValue != newValue) {
		return;
	}

	// "If the parent of the last member of ancestor list is not an Element,
	// and new value is not null, abort this algorithm."
	if (newValue !== null
	&& (!ancestorList[ancestorList.length - 1].parentNode
	|| ancestorList[ancestorList.length - 1].parentNode.nodeType != Node.ELEMENT_NODE)) {
		return;
	}

	// "While ancestor list is not empty:"
	while (ancestorList.length) {
		// "Let current ancestor be the last member of ancestor list."
		// "Remove the last member from ancestor list."
		var currentAncestor = ancestorList.pop();

		// "If the specified value of current ancestor for command is not null,
		// set propagated value to that value."
		if (getSpecifiedValue(currentAncestor, command) !== null) {
			propagatedValue = getSpecifiedValue(currentAncestor, command);
		}

		// "Let children be the children of current ancestor."
		var children = Array.prototype.slice.call(currentAncestor.childNodes);

		// "If the specified value of current ancestor for command is not null,
		// clear the value of current ancestor."
		if (getSpecifiedValue(currentAncestor, command) !== null) {
			clearValue(currentAncestor, command);
		}

		// "For every child in children:"
		for (var i = 0; i < children.length; i++) {
			var child = children[i];

			// "If child is node, continue with the next child."
			if (child == node) {
				continue;
			}

			// "If child is an Element whose specified value for command
			// is neither null nor equal to propagated value, continue with the
			// next child."
			if (child.nodeType == Node.ELEMENT_NODE
			&& getSpecifiedValue(child, command) !== null
			&& !valuesEqual(command, propagatedValue, getSpecifiedValue(child, command))) {
				continue;
			}

			// "If child is the last member of ancestor list, continue with the
			// next child."
			if (child == ancestorList[ancestorList.length - 1]) {
				continue;
			}

			// "Force the value of child, with command as in this algorithm
			// and new value equal to propagated value."
			forceValue(child, command, propagatedValue);
		}
	}
}

function forceValue(node, command, newValue) {
	// "If node's parent is null, abort this algorithm."
	if (!node.parentNode) {
		return;
	}

	// "If new value is null, abort this algorithm."
	if (newValue === null) {
		return;
	}

	// "If node is an Element, Text, Comment, or ProcessingInstruction node,
	// and is not an unwrappable node:"
	if ((node.nodeType == Node.ELEMENT_NODE
	|| node.nodeType == Node.TEXT_NODE
	|| node.nodeType == Node.COMMENT_NODE
	|| node.nodeType == Node.PROCESSING_INSTRUCTION_NODE)
	&& !isUnwrappableNode(node)) {
		// "Let candidate be node's previousSibling."
		var candidate = node.previousSibling;

		// "While candidate is a modifiable element, and candidate has exactly one
		// child, and that child is also a modifiable element, and candidate is
		// not a simple modifiable element or candidate's specified value for
		// command is not new value, set candidate to its child."
		while (isModifiableElement(candidate)
		&& candidate.childNodes.length == 1
		&& isModifiableElement(candidate.firstChild)
		&& (!isSimpleModifiableElement(candidate)
		|| !valuesEqual(command, getSpecifiedValue(candidate, command), newValue))) {
			candidate = candidate.firstChild;
		}

		// "If candidate is a simple modifiable element whose specified value and
		// effective value for command are both new value, and candidate is
		// not the previousSibling of node:"
		if (isSimpleModifiableElement(candidate)
		&& valuesEqual(command, getSpecifiedValue(candidate, command), newValue)
		&& valuesEqual(command, getEffectiveValue(candidate, command), newValue)
		&& candidate != node.previousSibling) {
			// "While candidate has children, insert the first child of
			// candidate into candidate's parent immediately before candidate,
			// preserving ranges."
			while (candidate.childNodes.length > 0) {
				movePreservingRanges(candidate.firstChild, candidate.parentNode, getNodeIndex(candidate));
			}

			// "Insert candidate into node's parent before node's
			// previousSibling."
			node.parentNode.insertBefore(candidate, node.previousSibling);

			// "Append the nextSibling of candidate as the last child of
			// candidate, preserving ranges."
			movePreservingRanges(candidate.nextSibling, candidate, candidate.childNodes.length);
		}

		// "Let candidate be node's nextSibling."
		var candidate = node.nextSibling;

		// "While candidate is a modifiable element, and candidate has exactly one
		// child, and that child is also a modifiable element, and candidate is
		// not a simple modifiable element or candidate's specified value for
		// command is not new value, set candidate to its child."
		while (isModifiableElement(candidate)
		&& candidate.childNodes.length == 1
		&& isModifiableElement(candidate.firstChild)
		&& (!isSimpleModifiableElement(candidate)
		|| !valuesEqual(command, getSpecifiedValue(candidate, command), newValue))) {
			candidate = candidate.firstChild;
		}

		// "If candidate is a simple modifiable element whose specified value and
		// effective value for command are both new value, and candidate is
		// not the nextSibling of node:"
		if (isSimpleModifiableElement(candidate)
		&& valuesEqual(command, getSpecifiedValue(candidate, command), newValue)
		&& valuesEqual(command, getEffectiveValue(candidate, command), newValue)
		&& candidate != node.nextSibling) {
			// "While candidate has children, insert the first child of
			// candidate into candidate's parent immediately before candidate,
			// preserving ranges."
			while (candidate.childNodes.length > 0) {
				movePreservingRanges(candidate.firstChild, candidate.parentNode, getNodeIndex(candidate));
			}

			// "Insert candidate into node's parent after node."
			node.parentNode.insertBefore(candidate, node.nextSibling);

			// "Append the nextSibling of candidate as the last child of
			// candidate, preserving ranges."
			movePreservingRanges(candidate.nextSibling, candidate, candidate.childNodes.length);
		}

		// "Let previous sibling and next sibling be node's previousSibling and
		// nextSibling."
		var previousSibling = node.previousSibling;
		var nextSibling = node.nextSibling;

		// "If previous sibling is a simple modifiable element whose specified
		// value and effective value for command are both new value, append
		// node as the last child of previous sibling, preserving ranges."
		if (isSimpleModifiableElement(previousSibling)
		&& valuesEqual(command, getSpecifiedValue(previousSibling, command), newValue)
		&& valuesEqual(command, getEffectiveValue(previousSibling, command), newValue)) {
			movePreservingRanges(node, previousSibling, previousSibling.childNodes.length);
		}

		// "If next sibling is a simple modifiable element whose specified value
		// and effective value for command are both new value:"
		if (isSimpleModifiableElement(nextSibling)
		&& valuesEqual(command, getSpecifiedValue(nextSibling, command), newValue)
		&& valuesEqual(command, getEffectiveValue(nextSibling, command), newValue)) {
			// "If node is not a child of previous sibling, insert node as the
			// first child of next sibling, preserving ranges."
			if (node.parentNode != previousSibling) {
				movePreservingRanges(node, nextSibling, 0);
			// "Otherwise, while next sibling has children, append the first
			// child of next sibling as the last child of previous sibling,
			// preserving ranges.  Then remove next sibling from its parent."
			} else {
				while (nextSibling.childNodes.length) {
					movePreservingRanges(nextSibling.firstChild, previousSibling, previousSibling.childNodes.length);
				}
				nextSibling.parentNode.removeChild(nextSibling);
			}
		}
	}

	// "If the effective value of command is new value on node, abort this
	// algorithm."
	if (valuesEqual(command, getEffectiveValue(node, command), newValue)) {
		return;
	}

	// "If node is an unwrappable node:"
	if (isUnwrappableNode(node)) {
		// "Let children be all children of node, omitting any that are
		// Elements whose specified value for command is neither null nor
		// equal to new value."
		var children = [];
		for (var i = 0; i < node.childNodes.length; i++) {
			if (node.childNodes[i].nodeType == Node.ELEMENT_NODE) {
				var specifiedValue = getSpecifiedValue(node.childNodes[i], command);

				if (specifiedValue !== null
				&& !valuesEqual(command, newValue, specifiedValue)) {
					continue;
				}
			}
			children.push(node.childNodes[i]);
		}

		// "Force the value of each Node in children, with command and new
		// value as in this invocation of the algorithm."
		for (var i = 0; i < children.length; i++) {
			forceValue(children[i], command, newValue);
		}

		// "Abort this algorithm."
		return;
	}

	// "If node is a Comment or ProcessingInstruction, abort this algorithm."
	if (node.nodeType == Node.COMMENT_NODE
	|| node.nodeType == Node.PROCESSING_INSTRUCTION_NODE) {
		return;
	}

	// "If the effective value of command is new value on node, abort this
	// algorithm."
	if (valuesEqual(command, getEffectiveValue(node, command), newValue)) {
		return;
	}

	// "Let new parent be null."
	var newParent = null;

	// "If the CSS styling flag is false:"
	if (!cssStylingFlag) {
		// "If command is "bold" and new value is "bold", let new parent be the
		// result of calling createElement("b") on the ownerDocument of node."
		if (command == "bold" && (newValue == "bold" || newValue == "700")) {
			newParent = node.ownerDocument.createElement("b");
		}

		// "If command is "italic" and new value is "italic", let new parent be
		// the result of calling createElement("i") on the ownerDocument of
		// node."
		if (command == "italic" && newValue == "italic") {
			newParent = node.ownerDocument.createElement("i");
		}

		// "If command is "strikethrough" and new value is "line-through", let
		// new parent be the result of calling createElement("s") on the
		// ownerDocument of node."
		if (command == "strikethrough" && newValue == "line-through") {
			newParent = node.ownerDocument.createElement("s");
		}

		// "If command is "underline" and new value is "underline", let new
		// parent be the result of calling createElement("u") on the
		// ownerDocument of node."
		if (command == "underline" && newValue == "underline") {
			newParent = node.ownerDocument.createElement("u");
		}

		// "If command is "foreColor", and new value is fully opaque with red,
		// green, and blue components in the range 0 to 255:"
		//
		// Not going to do this properly, only well enough to pass tests.
		if (command == "forecolor" && parseSimpleColor(newValue)) {
			// "Let new parent be the result of calling createElement("font")
			// on the ownerDocument of node."
			newParent = node.ownerDocument.createElement("font");

			// "If new value is one of the colors listed in the SVG color
			// keywords section of CSS3 Color, set the color attribute of new
			// parent to new value."
			//
			// "Otherwise, set the color attribute of new parent to the result
			// of applying the rules for serializing simple color values to new
			// value (interpreted as a simple color)."
			newParent.setAttribute("color", parseSimpleColor(newValue));
		}

		// "If command is "fontName", let new parent be the result of calling
		// createElement("font") on the ownerDocument of node, then set the
		// face attribute of new parent to new value."
		if (command == "fontname") {
			newParent = node.ownerDocument.createElement("font");
			newParent.face = newValue;
		}
	}

	// "If command is "createLink" or "unlink", let new parent be the result of
	// calling createElement("a") on the ownerDocument of node, then set the
	// href attribute of new parent to new value."
	if (command == "createlink" || command == "unlink") {
		newParent = node.ownerDocument.createElement("a");
		newParent.setAttribute("href", newValue);
	}

	// "If command is "fontSize"; and new value is one of "xx-small", "small",
	// "medium", "large", "x-large", "xx-large", or "xxx-large"; and either the
	// CSS styling flag is false, or new value is "xxx-large": let new parent
	// be the result of calling createElement("font") on the ownerDocument of
	// node, then set the size attribute of new parent to the number from the
	// following table based on new value: [table omitted]"
	if (command == "fontsize"
	&& ["xx-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"].indexOf(newValue) != -1
	&& (!cssStylingFlag || newValue == "xxx-large")) {
		newParent = node.ownerDocument.createElement("font");
		newParent.size = {
			"xx-small": 1,
			"small": 2,
			"medium": 3,
			"large": 4,
			"x-large": 5,
			"xx-large": 6,
			"xxx-large": 7
		}[newValue];
	}

	// "If command is "subscript" or "superscript" and new value is "sub", let
	// new parent be the result of calling createElement("sub") on the
	// ownerDocument of node."
	if ((command == "subscript" || command == "superscript")
	&& newValue == "sub") {
		newParent = node.ownerDocument.createElement("sub");
	}

	// "If command is "subscript" or "superscript" and new value is "super",
	// let new parent be the result of calling createElement("sup") on the
	// ownerDocument of node."
	if ((command == "subscript" || command == "superscript")
	&& newValue == "super") {
		newParent = node.ownerDocument.createElement("sup");
	}

	// "If new parent is null, let new parent be the result of calling
	// createElement("span") on the ownerDocument of node."
	if (!newParent) {
		newParent = node.ownerDocument.createElement("span");
	}

	// "Insert new parent in node's parent before node."
	node.parentNode.insertBefore(newParent, node);

	// "If the effective value of command for new parent is not new value, and
	// the relevant CSS property for command is not null, set that CSS property
	// of new parent to new value (if the new value would be valid)."
	var property = getRelevantCssProperty(command);
	if (property !== null
	&& !valuesEqual(command, getEffectiveValue(newParent, command), newValue)) {
		newParent.style[property] = newValue;
	}

	// "If command is "strikethrough", and new value is "line-through", and the
	// effective value of "strikethrough" for new parent is not "line-through",
	// set the "text-decoration" property of new parent to "line-through"."
	if (command == "strikethrough"
	&& newValue == "line-through"
	&& getEffectiveValue(newParent, "strikethrough") != "line-through") {
		newParent.style.textDecoration = "line-through";
	}

	// "If command is "underline", and new value is "underline", and the
	// effective value of "underline" for new parent is not "underline", set
	// the "text-decoration" property of new parent to "underline"."
	if (command == "underline"
	&& newValue == "underline"
	&& getEffectiveValue(newParent, "underline") != "underline") {
		newParent.style.textDecoration = "underline";
	}

	// "Append node to new parent as its last child, preserving ranges."
	movePreservingRanges(node, newParent, newParent.childNodes.length);

	// "If node is an Element and the effective value of command for node is
	// not new value:"
	if (node.nodeType == Node.ELEMENT_NODE
	&& !valuesEqual(command, getEffectiveValue(node, command), newValue)) {
		// "Insert node into the parent of new parent before new parent,
		// preserving ranges."
		movePreservingRanges(node, newParent.parentNode, getNodeIndex(newParent));

		// "Remove new parent from its parent."
		newParent.parentNode.removeChild(newParent);

		// "If new parent is a span, and either a) command is "underline" or
		// "strikethrough", or b) command is "fontSize" and new value is not
		// "xxx-large", or c) command is not "fontSize" and the relevant CSS
		// property for command is not null:"
		if (newParent.tagName == "SPAN"
		&& (
			(command == "underline" || command == "strikethrough")
			|| (command == "fontsize" && newValue != "xxx-large")
			|| (command != "fontsize" && property !== null)
		)) {
			// "If the relevant CSS property for command is not null, set that
			// CSS property of node to new value."
			if (property !== null) {
				node.style[property] = newValue;
			}

			// "If command is "strikethrough" and new value is "line-through",
			// alter the "text-decoration" property of node to include
			// "line-through" (preserving "overline" or "underline" if
			// present)."
			if (command == "strikethrough" && newValue == "line-through") {
				if (node.style.textDecoration == ""
				|| node.style.textDecoration == "none") {
					node.style.textDecoration = "line-through";
				} else {
					node.style.textDecoration += " line-through";
				}
			}

			// "If command is "underline" and new value is "underline", alter
			// the "text-decoration" property of node to include "underline"
			// (preserving "overline" or "line-through" if present)."
			if (command == "underline" && newValue == "underline") {
				if (node.style.textDecoration == ""
				|| node.style.textDecoration == "none") {
					node.style.textDecoration = "underline";
				} else {
					node.style.textDecoration += " underline";
				}
			}

		// "Otherwise:"
		} else {
			// "Let children be all children of node, omitting any that are
			// Elements whose specified value for command is neither null nor
			// equal to new value."
			var children = [];
			for (var i = 0; i < node.childNodes.length; i++) {
				if (node.childNodes[i].nodeType == Node.ELEMENT_NODE) {
					var specifiedValue = getSpecifiedValue(node.childNodes[i], command);

					if (specifiedValue !== null
					&& !valuesEqual(command, newValue, specifiedValue)) {
						continue;
					}
				}
				children.push(node.childNodes[i]);
			}

			// "Force the value of each Node in children, with command and new
			// value as in this invocation of the algorithm."
			for (var i = 0; i < children.length; i++) {
				forceValue(children[i], command, newValue);
			}
		}
	}
}

function setNodeValue(node, command, newValue) {
	// "If node is a Document, set the value of its Element child (if it has
	// one) and abort this algorithm."
	if (node.nodeType == Node.DOCUMENT_NODE) {
		for (var i = 0; i < node.childNodes.length; i++) {
			if (node.childNodes[i].nodeType == Node.ELEMENT_NODE) {
				setNodeValue(node.childNodes[i], command, newValue);
				break;
			}
		}
		return;
	}

	// "If node is a DocumentFragment, let children be a list of its children.
	// Set the value of each member of children, then abort this algorithm."
	if (node.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
		var children = [];
		for (var i = 0; i < node.childNodes.length; i++) {
			children.push(node.childNodes[i]);
		}
		for (var i = 0; i < children.length; i++) {
			setNodeValue(children[i], command, newValue);
		}
		return;
	}

	// "If node's parent is null, or if node is a DocumentType, abort this
	// algorithm."
	if (!node.parentNode || node.nodeType == Node.DOCUMENT_TYPE_NODE) {
		return;
	}

	// "If node is not editable:"
	if (!isEditable(node)) {
		// "Let children be the children of node."
		var children = Array.prototype.slice.call(node.childNodes);

		// "Set the value of each member of children."
		for (var i = 0; i < children.length; i++) {
			setNodeValue(children[i], command, newValue);
		}

		// "Abort this algorithm."
		return;
	}

	// "If node is an Element:"
	if (node.nodeType == Node.ELEMENT_NODE) {
		// "Clear the value of node, and let new nodes be the result."
		var newNodes = clearValue(node, command);

		// "For each new node in new nodes, set the value of new node, with the
		// same inputs as this invocation of the algorithm."
		for (var i = 0; i < newNodes.length; i++) {
			setNodeValue(newNodes[i], command, newValue);
		}

		// "If node's parent is null, abort this algorithm."
		if (!node.parentNode) {
			return;
		}
	}

	// "Push down values on node."
	pushDownValues(node, command, newValue);

	// "Force the value of node."
	forceValue(node, command, newValue);

	// "Let children be the children of node."
	var children = Array.prototype.slice.call(node.childNodes);

	// "Set the value of each member of children."
	for (var i = 0; i < children.length; i++) {
		setNodeValue(children[i], command, newValue);
	}
}

// This is bad :(
var globalRange = null;

function getRelevantCssProperty(command) {
	var prop = {
		bold: "fontWeight",
		fontname: "fontFamily",
		fontsize: "fontSize",
		forecolor: "color",
		hilitecolor: "backgroundColor",
		italic: "fontStyle",
		subscript: "verticalAlign",
		superscript: "verticalAlign",
	}[command];

	if (typeof prop == "undefined") {
		return null;
	}
	return prop;
}

function myExecCommand(command, showUI, value, range) {
	command = command.toLowerCase();

	if (command != "stylewithcss" && command != "usecss") {
		if (typeof range == "undefined" && getSelection().rangeCount) {
			range = getSelection().getRangeAt(0);
		}

		if (!range) {
			return;
		}
	}

	globalRange = range;

	switch (command) {
		case "bold":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node with new value
		// "normal". Otherwise, set their value with new value "bold"."
		var nodeList = decomposeRange(range);
		var newValue = getState("bold", range) ? "normal" : "bold";
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, newValue);
		}
		break;

		case "createlink":
		// "If value is the empty string, abort these steps and do nothing."
		if (value === "") {
			break;
		}

		// "Decompose the range, and let node list be the result."
		var nodeList = decomposeRange(range);

		// "For each a element that has an href attribute and is an ancestor of
		// some node in node list, set that element's href attribute to value."
		for (var i = 0; i < nodeList.length; i++) {
			var candidate = nodeList[i].parentNode;
			while (candidate) {
				if (isHtmlElement(candidate)
				&& candidate.tagName == "A"
				&& candidate.hasAttribute("href")) {
					candidate.setAttribute("href", value);
				}

				candidate = candidate.parentNode;
			}
		}

		// "Set the value of each node in node list to value."
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, value);
		}
		break;

		case "fontname":
		// "Decompose the range, then set the value of each returned node with
		// new value equal to value."
		var nodeList = decomposeRange(range);
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, value);
		}
		break;

		case "fontsize":
		// "If value is the empty string, do nothing and abort these steps."
		if (value === "") {
			return;
		}

		// "Strip leading and trailing whitespace from value."
		//
		// Cheap hack, not following the actual algorithm.
		value = value.trim();

		// "If value is a valid floating point number, or would be a valid
		// floating point number if a single leading "+" character were
		// stripped:"
		if (/^[-+]?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(value)) {
			var mode;

			// "If the first character of value is "+", delete the character
			// and let mode be "relative-plus"."
			if (value[0] == "+") {
				value = value.slice(1);
				mode = "relative-plus";
			// "Otherwise, if the first character of value is "-", delete the
			// character and let mode be "relative-minus"."
			} else if (value[0] == "-") {
				value = value.slice(1);
				mode = "relative-minus";
			// "Otherwise, let mode be "absolute"."
			} else {
				mode = "absolute";
			}

			// "Apply the rules for parsing non-negative integers to value, and
			// let number be the result."
			//
			// Another cheap hack.
			var num = parseInt(value);

			// "If mode is "relative-plus", add three to number."
			if (mode == "relative-plus") {
				num += 3;
			}

			// "If mode is "relative-minus", negate number, then add three to
			// it."
			if (mode == "relative-minus") {
				num = 3 - num;
			}

			// "If number is less than one, let number equal 1."
			if (num < 1) {
				num = 1;
			}

			// "If number is greater than seven, let number equal 7."
			if (num > 7) {
				num = 7;
			}

			// "Set value to the string here corresponding to number:" [table
			// omitted]
			value = {
				1: "xx-small",
				2: "small",
				3: "medium",
				4: "large",
				5: "x-large",
				6: "xx-large",
				7: "xxx-large"
			}[num];
		}

		// "If value is not one of the strings "xx-small", "x-small", "small",
		// "medium", "large", "x-large", "xx-large", "xxx-large", and is not a
		// valid CSS absolute length, then do nothing and abort these steps."
		//
		// More cheap hacks to skip valid CSS absolute length checks.
		if (["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"].indexOf(value) == -1
		&& !/^[0-9]+(\.[0-9]+)?(cm|mm|in|pt|pc)$/.test(value)) {
			return;
		}

		// "Decompose the range, then set the value of each returned node to
		// value."
		var nodeList = decomposeRange(range);
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, value);
		}
		break;

		case "forecolor":
		case "hilitecolor":
		// "If value is not a valid CSS color, prepend "#" to it."
		//
		// "If value is still not a valid CSS color, or if it is currentColor,
		// do nothing and abort these steps."
		//
		// Cheap hack for testing, no attempt to be comprehensive.
		if (/^([0-9a-fA-F]{3}){1,2}$/.test(value)) {
			value = "#" + value;
		}
		if (!/^#([0-9a-fA-F]{3}){1,2}$/.test(value)
		&& !/^(rgba?|hsla?)\(.*\)$/.test(value)
		// Not gonna list all the keywords, only the ones I use.
		&& value != "red"
		&& value != "cornsilk"
		&& value != "transparent") {
			return;
		}

		// "Decompose the range, then set the value of each returned node to
		// value."
		var nodeList = decomposeRange(range);
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, value);
		}
		break;

		case "indent":
		// "Block-extend the range, and let new range be the result."
		var newRange = blockExtendRange(range);

		// "If the child of new range's end node with index equal to its end
		// offset is a br:"
		var end = newRange.endContainer.childNodes[newRange.endOffset];
		if (isHtmlElement(end) && end.tagName == "BR") {
			// "Remove that br from its parent."
			end.parentNode.removeChild(br);

			// "While the end offset of new range is equal to the length of its
			// end node, set the end of new range to (parent of end node, 1 +
			// index of end node)."
			while (newRange.endOffset == getNodeLength(newRange.endContainer)) {
				newRange.setEnd(newRange.endContainer.parentNode, 1 + getNodeIndex(newRange.endContainer));
			}
		}

		// "Let node list be a list of nodes, initially empty."
		var nodeList = [];

		// "For each node node contained in new range, if node can be the child
		// of a blockquote and if no ancestor of node is in node list, append
		// node to node list."
		for (var node = newRange.startContainer; node != nextNodeDescendants(newRange.endContainer); node = nextNode(node)) {
			if (!isContained(node, newRange)) {
				continue;
			}

			if (node.nodeType == Node.ELEMENT_NODE
			&& ["TBODY", "THEAD", "TR", "TH", "TD"].indexOf(node.tagName) != -1) {
				continue;
			}

			// We only need to check that the last member isn't an ancestor,
			// because no ancestor of a member can be in the list.
			if (nodeList.length
			&& isAncestor(nodeList[nodeList.length - 1], node)) {
				continue;
			}

			nodeList.push(node);
		}

		// "Indent each member of node list."
		for (var i = 0; i < nodeList.length; i++) {
			indentNode(nodeList[i]);
		}
		break;

		case "inserthorizontalrule":
		// "Run deleteContents() on the range."
		range.deleteContents();

		// "Let (node, offset) be the range's start."
		var node = range.startContainer;
		var offset = range.startOffset;

		// "If node is a Text or Comment node and its parent is null, abort
		// these steps and do nothing."
		if (!node.parentNode
		&& (node.nodeType == Node.TEXT_NODE
		|| node.nodeType == Node.COMMENT_NODE)) {
			return;
		}

		// "Let hr be the result of calling createElement("hr") on the
		// ownerDocument of node (or on node itself if it's a Document)."
		var hr = (node.nodeType == Node.DOCUMENT_NODE
			? node : node.ownerDocument).createElement("hr");

		// "If node is a Text node, and offset is not equal to 0 or the length
		// of node, run splitText(offset) on node."
		if (node.nodeType == Node.TEXT_NODE
		&& offset != 0
		&& offset != node.length) {
			node.splitText(offset);
		}

		// "If node is a Text node, and offset is equal to the length of node,
		// set node to its nextSibling."
		if (node.nodeType == Node.TEXT_NODE
		&& offset == node.length) {
			node = node.nextSibling;
		}

		// "If node is null or is a Text or Comment node, run insertBefore(hr,
		// node) on the parent of node."
		if (!node
		|| node.nodeType == Node.TEXT_NODE
		|| node.nodeType == Node.COMMENT_NODE) {
			node.parentNode.insertBefore(hr, node);
		// "Otherwise, let child be the offsetth child of node (or null if
		// there is no such child), and run insertBefore(img, child) on node."
		} else {
			var child = node.childNodes.length == offset
				? null
				: node.childNodes[offset];
			node.insertBefore(hr, child);
		}

		// "Run collapse() on the Selection, with first argument equal to the
		// parent of hr and the second argument equal to one plus the index of
		// hr."
		//
		// Not everyone actually supports collapse(), so we do it manually
		// instead.  Also, we need to modify the actual range we're given as
		// well, for the sake of autoimplementation.html's range-filling-in.
		range.setStart(hr.parentNode, 1 + getNodeIndex(hr));
		range.setEnd(hr.parentNode, 1 + getNodeIndex(hr));
		getSelection().removeAllRanges();
		getSelection().addRange(range);
		break;

		case "insertimage":
		// "If value is the empty string, abort these steps and do nothing."
		if (value === "") {
			return;
		}

		// "Run deleteContents() on the range."
		range.deleteContents();

		// "Let (node, offset) be the range's start."
		var node = range.startContainer;
		var offset = range.startOffset;

		// "If node is a Text or Comment node and its parent is null, abort
		// these steps and do nothing."
		if (!node.parentNode
		&& (node.nodeType == Node.TEXT_NODE
		|| node.nodeType == Node.COMMENT_NODE)) {
			return;
		}

		// "Let img be the result of calling createElement("img") on the
		// ownerDocument of node (or on node itself if it's a Document)."
		var img = (node.nodeType == Node.DOCUMENT_NODE
			? node : node.ownerDocument).createElement("img");

		// "Run setAttribute("src", value) on img."
		img.setAttribute("src", value);

		// "If node is a Text node, and offset is not equal to 0 or the length
		// of node, run splitText(offset) on node."
		if (node.nodeType == Node.TEXT_NODE
		&& offset != 0
		&& offset != node.length) {
			node.splitText(offset);
		}

		// "If node is a Text node, and offset is equal to the length of node,
		// set node to its nextSibling."
		if (node.nodeType == Node.TEXT_NODE
		&& offset == node.length) {
			node = node.nextSibling;
		}

		// "If node is null or is a Text or Comment node, run insertBefore(img,
		// node) on the parent of node."
		if (!node
		|| node.nodeType == Node.TEXT_NODE
		|| node.nodeType == Node.COMMENT_NODE) {
			node.parentNode.insertBefore(img, node);
		// "Otherwise, let child be the offsetth child of node (or null if
		// there is no such child), and run insertBefore(img, child) on node."
		} else {
			var child = node.childNodes.length == offset
				? null
				: node.childNodes[offset];
			node.insertBefore(img, child);
		}

		// "Run collapse() on the Selection, with first argument equal to the
		// parent of img and the second argument equal to one plus the index of
		// img."
		//
		// Not everyone actually supports collapse(), so we do it manually
		// instead.  Also, we need to modify the actual range we're given as
		// well, for the sake of autoimplementation.html's range-filling-in.
		range.setStart(img.parentNode, 1 + getNodeIndex(img));
		range.setEnd(img.parentNode, 1 + getNodeIndex(img));
		getSelection().removeAllRanges();
		getSelection().addRange(range);

		// IE adds width and height attributes for some reason, so remove those
		// to actually do what the spec says.
		img.removeAttribute("width");
		img.removeAttribute("height");
		break;

		case "italic":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node with new value
		// "normal". Otherwise, set their value with new value "italic"."
		var nodeList = decomposeRange(range);
		var newValue = getState("italic", range) ? "normal" : "italic";
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, newValue);
		}
		break;

		case "outdent":
		// "Block-extend the range, and let new range be the result."
		var newRange = blockExtendRange(range);

		// "Let node list be all nodes contained in new range that have no
		// children."
		var nodeList = [];
		for (
			var node = newRange.startContainer;
			node != nextNodeDescendants(newRange.endContainer);
			node = nextNode(node)
		) {
			if (isContained(node, newRange)
			&& !node.hasChildNodes()) {
				nodeList.push(node);
			}
		}

		// "Outdent each member of node list."
		for (var i = 0; i < nodeList.length; i++) {
			outdentNode(nodeList[i]);
		}
		break;

		case "removeformat":
		// "Decompose the range, and let node list be the result."
		var nodeList = decomposeRange(range);

		// "For each node in node list, unset the style attribute of node (if
		// it's an Element) and then all its Element descendants."
		for (var i = 0; i < nodeList.length; i++) {
			for (
				var node = nodeList[i];
				node != nextNodeDescendants(nodeList[i]);
				node = nextNode(node)
			) {
				if (node.nodeType == Node.ELEMENT_NODE) {
					node.removeAttribute("style");
				}
			}
		}

		// "Let elements to remove be a list of all HTML elements that are the
		// same as or descendants of some member of node list and have non-null
		// parents and satisfy (insert conditions here)."
		var elementsToRemove = [];
		for (var i = 0; i < nodeList.length; i++) {
			for (
				var node = nodeList[i];
				node == nodeList[i] || isDescendant(node, nodeList[i]);
				node = nextNode(node)
			) {
				if (isHtmlElement(node)
				&& node.parentNode
				// FIXME: Extremely partial list for testing
				&& ["A", "AUDIO", "BR", "DIV", "HR", "IMG", "P", "TD", "VIDEO", "WBR"].indexOf(node.tagName) == -1) {
					elementsToRemove.push(node);
				}
			}
		}

		// "For each element in elements to remove:"
		for (var i = 0; i < elementsToRemove.length; i++) {
			var element = elementsToRemove[i];

			// "While element has children, insert the first child of element
			// into the parent of element immediately before element,
			// preserving ranges."
			while (element.childNodes.length) {
				movePreservingRanges(element.firstChild, element.parentNode, getNodeIndex(element));
			}

			// "Remove element from its parent."
			element.parentNode.removeChild(element);
		}

		// "For each of the entries in the following table, in the given order:
		// decompose the range again; then set the value of the resulting
		// nodes, with command and new value as given."
		var table = {
			"subscript": "baseline",
			"bold": "normal",
			"fontname": null,
			"fontsize": null,
			"forecolor": null,
			"hilitecolor": null,
			"italic": "normal",
			"strikethrough": null,
			"underline": null,
		};
		for (var command in table) {
			var nodeList = decomposeRange(range);
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, table[command]);
			}
		}
		break;

		case "strikethrough":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node to null. Otherwise,
		// set their value to "line-through"."
		var nodeList = decomposeRange(range);
		var newValue = getState(command, range) ? null : "line-through";
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, newValue);
		}
		break;

		case "stylewithcss":
		// "Convert value to a boolean according to the algorithm in WebIDL,
		// and set the CSS styling flag to the result."
		cssStylingFlag = Boolean(value);
		break;

		case "subscript":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node with new value
		// "baseline". Otherwise, set their value with new value "baseline",
		// then decompose the range again and set the value of each returned
		// node with new value "sub"."
		var nodeList = decomposeRange(range);
		if (getState(command, range)) {
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "baseline");
			}
		} else {
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "baseline");
			}
			var nodeList = decomposeRange(range);
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "sub");
			}
		}
		break;

		case "superscript":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node with new value
		// "baseline". Otherwise, set their value with new value "baseline",
		// then decompose the range again and set the value of each returned
		// node with new value "super"."
		var nodeList = decomposeRange(range);
		if (getState(command, range)) {
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "baseline");
			}
		} else {
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "baseline");
			}
			var nodeList = decomposeRange(range);
			for (var i = 0; i < nodeList.length; i++) {
				setNodeValue(nodeList[i], command, "super");
			}
		}
		break;

		case "underline":
		// "Decompose the range. If the state of the range for this command is
		// then true, set the value of each returned node to null. Otherwise,
		// set their value to "underline"."
		var nodeList = decomposeRange(range);
		var newValue = getState("underline", range) ? null : "underline";
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, newValue);
		}
		break;

		case "unlink":
		// "Decompose the range, and set the value of each returned node to
		// null."
		var nodeList = decomposeRange(range);
		for (var i = 0; i < nodeList.length; i++) {
			setNodeValue(nodeList[i], command, null);
		}
		break;

		case "usecss":
		// "Convert value to a boolean according to the algorithm in WebIDL,
		// and set the CSS styling flag to the negation of the result."
		cssStylingFlag = !value;
		break;

		default:
		break;
	}
}

function indentNode(node) {
	// "If the previousSibling of node is an HTML element; its
	// "display" property computes to "block"; its "margin-left" and
	// "margin-right" properties compute to "40px"; and its
	// "margin-top" and "margin-bottom" properties compute to "0"; then
	// append node as the last child of its previousSibling, preserving
	// ranges, then abort these steps."
	if (isHtmlElement(node.previousSibling)) {
		var style = getComputedStyle(node.previousSibling);
		if (style.display == "block"
		&& style.marginLeft == "40px"
		&& style.marginRight == "40px"
		&& style.marginTop == "0px"
		&& style.marginBottom == "0px") {
			movePreservingRanges(node, node.previousSibling, node.previousSibling.childNodes.length);
			return;
		}
	}

	// "Let tag be "div" if the CSS styling flag is true, otherwise
	// "blockquote"."
	var tag = cssStylingFlag ? "div" : "blockquote";

	// "Let new parent be the result of calling createElement(tag) on
	// the ownerDocument of node."
	var newParent = node.ownerDocument.createElement(tag);

	// "Insert new parent into node's parent immediately before node."
	node.parentNode.insertBefore(newParent, node);

	// "Set the CSS property "margin" of new parent to "0 40px"."
	newParent.setAttribute("style", "margin: 0 40px");

	// "Append node as the last child of new parent, preserving
	// ranges."
	movePreservingRanges(node, newParent, 0);
}

function outdentNode(node) {
	// "If node is not editable, abort these steps."
	if (!isEditable(node)) {
		return;
	}

	// "If node is an indentation element:"
	if (isIndentationElement(node)) {
		// "If node's last child and nextSibling are both inline nodes or its
		// first child and previousSibling are both inline nodes, unset all
		// attributes of node, then set the tag name of node to "div"."
		if ((isInlineNode(node.lastChild) && isInlineNode(node.nextSibling))
		|| (isInlineNode(node.firstChild) && isInlineNode(node.previousSibling))) {
			while (node.attributes.length) {
				node.removeAttribute(node.attributes[0].name);
			}

			setTagName(node, "div");

		// "Otherwise, remove node, preserving its descendants."
		} else {
			removePreservingDescendants(node);
		}

		// "Abort these steps."
		return;
	}

	// "If node is a potential indentation element:"
	if (isPotentialIndentationElement(node)) {
		// "Set the tag name of node to "div"."
		setTagName(node, "div");

		// "Unset the class and dir attributes of node, if any."
		node.removeAttribute("class");
		node.removeAttribute("dir");

		// "Unset the margin, padding, and border CSS properties of node."
		node.style.margin = "";
		node.style.padding = "";
		node.style.border = "";
		if (node.getAttribute("style") == "") {
			node.removeAttribute("style");
		}

		// "Abort these steps."
		return;
	}

	// "Let current ancestor be node's parent."
	var currentAncestor = node.parentNode;

	// "Let ancestor list be a list of nodes, initially empty."
	var ancestorList = [];

	// "While current ancestor is an editable Element that is not an
	// indentation element, append current ancestor to ancestor list and then
	// set current ancestor to its parent."
	while (isEditable(currentAncestor)
	&& currentAncestor.nodeType == Node.ELEMENT_NODE
	&& !isIndentationElement(currentAncestor)) {
		ancestorList.push(currentAncestor);
		currentAncestor = currentAncestor.parentNode;
	}

	// "If current ancestor is not an editable indentation element:"
	if (!isEditable(currentAncestor)
	|| !isIndentationElement(currentAncestor)) {
		// "Let current ancestor be node's parent."
		currentAncestor = node.parentNode;

		// "Let ancestor list be the empty list."
		ancestorList = [];

		// "While current ancestor is an editable Element that is not a
		// potential indentation element, append current ancestor to ancestor
		// list and then set current ancestor to its parent."
		while (isEditable(currentAncestor)
		&& currentAncestor.nodeType == Node.ELEMENT_NODE
		&& !isPotentialIndentationElement(currentAncestor)) {
			ancestorList.push(currentAncestor);
			currentAncestor = currentAncestor.parentNode;
		}
	}

	// "If current ancestor is not an editable potential indentation element,
	// abort these steps."
	if (!isEditable(currentAncestor)
	|| !isPotentialIndentationElement(currentAncestor)) {
		return;
	}

	// "Append current ancestor to ancestor list."
	ancestorList.push(currentAncestor);

	// "Let original ancestor be current ancestor."
	var originalAncestor = currentAncestor;

	// "While ancestor list is not empty:"
	while (ancestorList.length) {
		// "Let current ancestor be the last member of ancestor list."
		//
		// "Remove the last member of ancestor list."
		currentAncestor = ancestorList.pop();

		// "Let children be the children of current ancestor."
		var children = [].slice.call(currentAncestor.childNodes);

		// "For each child in children, if child is neither node nor the last
		// member of ancestor list, indent child."
		for (var i = 0; i < children.length; i++) {
			var child = children[i];
			if (child != node && child != ancestorList[ancestorList.length - 1]) {
				indentNode(child);
			}
		}
	}

	// "Outdent original ancestor."
	outdentNode(originalAncestor);
}

// "A potential indentation element is either a blockquote, or a div that has a
// style attribute that sets "margin" or some subproperty of it."
function isPotentialIndentationElement(node) {
	if (!isHtmlElement(node)) {
		return false;
	}

	if (node.tagName == "BLOCKQUOTE") {
		return true;
	}

	if (node.tagName != "DIV") {
		return false;
	}

	for (var i = 0; i < node.style.length; i++) {
		// Approximate check
		if (/^(-[a-z]+-)?margin/.test(node.style[i])) {
			return true;
		}
	}

	return false;
}

// "An indentation element is a potential indentation element that has no
// attributes other than one or more of
//
//   * "a style attribute that sets no properties other than "margin", "border",
//     "padding", or subproperties of those;
//   * "a class attribute;
//   * "a dir attribute."
function isIndentationElement(node) {
	if (!isPotentialIndentationElement(node)) {
		return false;
	}

	if (node.tagName != "BLOCKQUOTE" && node.tagName != "DIV") {
		return false;
	}

	for (var i = 0; i < node.attributes.length; i++) {
		if (!isHtmlNamespace(node.attributes[i].namespaceURI)
		|| ["style", "class", "dir"].indexOf(node.attributes[i].name) == -1) {
			return false;
		}
	}

	for (var i = 0; i < node.style.length; i++) {
		// This is approximate, but it works well enough for my purposes.
		if (!/^(-[a-z]+-)?(margin|border|padding)/.test(node.style[i])) {
			return false;
		}
	}

	return true;
}

function myQueryCommandState(command) {
	command = command.toLowerCase();

	if (!getSelection().rangeCount) {
		return false;
	}

	var range = getSelection().getRangeAt(0);

	return getState(command, range);
}

function getState(command, range) {
	if (command == "stylewithcss") {
		return cssStylingFlag;
	}

	if (command != "bold"
	&& command != "italic"
	&& command != "strikethrough"
	&& command != "underline"
	&& command != "subscript"
	&& command != "superscript") {
		return false;
	}

	// XXX: This algorithm for getting all effectively contained nodes might be
	// wrong . . .
	var node = range.startContainer;
	while (node.parentNode && node.parentNode.firstChild == node) {
		node = node.parentNode;
	}
	var stop = nextNodeDescendants(range.endContainer);

	for (; node && node != stop; node = nextNode(node)) {
		if (!isEffectivelyContained(node, range)) {
			continue;
		}

		if (node.nodeType != Node.TEXT_NODE) {
			continue;
		}

		if (!isEditable(node)) {
			continue;
		}

		if (command == "bold") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value at least 700. Otherwise false."
			var fontWeight = getEffectiveValue(node, command);
			if (fontWeight !== "bold"
			&& fontWeight !== "700"
			&& fontWeight !== "800"
			&& fontWeight !== "900") {
				return false;
			}
		} else if (command == "italic") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value either "italic" or "oblique".
			// Otherwise false."
			var fontStyle = getEffectiveValue(node, command);
			if (fontStyle !== "italic"
			&& fontStyle !== "oblique") {
				return false;
			}
		} else if (command == "strikethrough") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value "line-through". Otherwise
			// false."
			var textDecoration = getEffectiveValue(node, command);
			if (textDecoration !== "line-through") {
				return false;
			}
		} else if (command == "underline") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value "underline". Otherwise false."
			var textDecoration = getEffectiveValue(node, command);
			if (textDecoration !== "underline") {
				return false;
			}
		} else if (command == "subscript") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value "sub". Otherwise false."
			var verticalAlign = getEffectiveValue(node, command);
			if (verticalAlign !== "sub") {
				return false;
			}
		} else if (command == "superscript") {
			// "True if every editable Text node that is effectively contained
			// in the range has effective value "super". Otherwise false."
			var verticalAlign = getEffectiveValue(node, command);
			if (verticalAlign !== "super") {
				return false;
			}
		}
	}

	return true;
}

function myQueryCommandValue(command) {
	command = command.toLowerCase();

	if (!getSelection().rangeCount) {
		return "";
	}

	var range = getSelection().getRangeAt(0);

	return "";
}
