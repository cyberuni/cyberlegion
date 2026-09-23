#!/usr/bin/env node
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/error.js
var require_error = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* CommanderError class
	*/
	var CommanderError = class extends Error {
		/**
		* Constructs the CommanderError class
		* @param {number} exitCode suggested exit code which could be used with process.exit
		* @param {string} code an id string representing the error
		* @param {string} message human-readable description of the error
		*/
		constructor(exitCode, code, message) {
			super(message);
			Error.captureStackTrace(this, this.constructor);
			this.name = this.constructor.name;
			this.code = code;
			this.exitCode = exitCode;
			this.nestedError = void 0;
		}
	};
	/**
	* InvalidArgumentError class
	*/
	var InvalidArgumentError = class extends CommanderError {
		/**
		* Constructs the InvalidArgumentError class
		* @param {string} [message] explanation of why argument is invalid
		*/
		constructor(message) {
			super(1, "commander.invalidArgument", message);
			Error.captureStackTrace(this, this.constructor);
			this.name = this.constructor.name;
		}
	};
	exports.CommanderError = CommanderError;
	exports.InvalidArgumentError = InvalidArgumentError;
}));
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/argument.js
var require_argument = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { InvalidArgumentError } = require_error();
	var Argument = class {
		/**
		* Initialize a new command argument with the given name and description.
		* The default is that the argument is required, and you can explicitly
		* indicate this with <> around the name. Put [] around the name for an optional argument.
		*
		* @param {string} name
		* @param {string} [description]
		*/
		constructor(name, description) {
			this.description = description || "";
			this.variadic = false;
			this.parseArg = void 0;
			this.defaultValue = void 0;
			this.defaultValueDescription = void 0;
			this.argChoices = void 0;
			switch (name[0]) {
				case "<":
					this.required = true;
					this._name = name.slice(1, -1);
					break;
				case "[":
					this.required = false;
					this._name = name.slice(1, -1);
					break;
				default:
					this.required = true;
					this._name = name;
			}
			if (this._name.endsWith("...")) {
				this.variadic = true;
				this._name = this._name.slice(0, -3);
			}
		}
		/**
		* Return argument name.
		*
		* @return {string}
		*/
		name() {
			return this._name;
		}
		/**
		* @package
		*/
		_collectValue(value, previous) {
			if (previous === this.defaultValue || !Array.isArray(previous)) return [value];
			previous.push(value);
			return previous;
		}
		/**
		* Set the default value, and optionally supply the description to be displayed in the help.
		*
		* @param {*} value
		* @param {string} [description]
		* @return {Argument}
		*/
		default(value, description) {
			this.defaultValue = value;
			this.defaultValueDescription = description;
			return this;
		}
		/**
		* Set the custom handler for processing CLI command arguments into argument values.
		*
		* @param {Function} [fn]
		* @return {Argument}
		*/
		argParser(fn) {
			this.parseArg = fn;
			return this;
		}
		/**
		* Only allow argument value to be one of choices.
		*
		* @param {string[]} values
		* @return {Argument}
		*/
		choices(values) {
			this.argChoices = values.slice();
			this.parseArg = (arg, previous) => {
				if (!this.argChoices.includes(arg)) throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
				if (this.variadic) return this._collectValue(arg, previous);
				return arg;
			};
			return this;
		}
		/**
		* Make argument required.
		*
		* @returns {Argument}
		*/
		argRequired() {
			this.required = true;
			return this;
		}
		/**
		* Make argument optional.
		*
		* @returns {Argument}
		*/
		argOptional() {
			this.required = false;
			return this;
		}
	};
	/**
	* Takes an argument and returns its human readable equivalent for help usage.
	*
	* @param {Argument} arg
	* @return {string}
	* @private
	*/
	function humanReadableArgName(arg) {
		const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
		return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
	}
	exports.Argument = Argument;
	exports.humanReadableArgName = humanReadableArgName;
}));
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/help.js
var require_help = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { humanReadableArgName } = require_argument();
	/**
	* TypeScript import types for JSDoc, used by Visual Studio Code IntelliSense and `npm run typescript-checkJS`
	* https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#import-types
	* @typedef { import("./argument.js").Argument } Argument
	* @typedef { import("./command.js").Command } Command
	* @typedef { import("./option.js").Option } Option
	*/
	var Help = class {
		constructor() {
			this.helpWidth = void 0;
			this.minWidthToWrap = 40;
			this.sortSubcommands = false;
			this.sortOptions = false;
			this.showGlobalOptions = false;
		}
		/**
		* prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
		* and just before calling `formatHelp()`.
		*
		* Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
		*
		* @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
		*/
		prepareContext(contextOptions) {
			this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
		}
		/**
		* Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
		*
		* @param {Command} cmd
		* @returns {Command[]}
		*/
		visibleCommands(cmd) {
			const visibleCommands = cmd.commands.filter((cmd) => !cmd._hidden);
			const helpCommand = cmd._getHelpCommand();
			if (helpCommand && !helpCommand._hidden) visibleCommands.push(helpCommand);
			if (this.sortSubcommands) visibleCommands.sort((a, b) => {
				return a.name().localeCompare(b.name());
			});
			return visibleCommands;
		}
		/**
		* Compare options for sort.
		*
		* @param {Option} a
		* @param {Option} b
		* @returns {number}
		*/
		compareOptions(a, b) {
			const getSortKey = (option) => {
				return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
			};
			return getSortKey(a).localeCompare(getSortKey(b));
		}
		/**
		* Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
		*
		* @param {Command} cmd
		* @returns {Option[]}
		*/
		visibleOptions(cmd) {
			const visibleOptions = cmd.options.filter((option) => !option.hidden);
			const helpOption = cmd._getHelpOption();
			if (helpOption && !helpOption.hidden) {
				const removeShort = helpOption.short && cmd._findOption(helpOption.short);
				const removeLong = helpOption.long && cmd._findOption(helpOption.long);
				if (!removeShort && !removeLong) visibleOptions.push(helpOption);
				else if (helpOption.long && !removeLong) visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
				else if (helpOption.short && !removeShort) visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
			}
			if (this.sortOptions) visibleOptions.sort(this.compareOptions);
			return visibleOptions;
		}
		/**
		* Get an array of the visible global options. (Not including help.)
		*
		* @param {Command} cmd
		* @returns {Option[]}
		*/
		visibleGlobalOptions(cmd) {
			if (!this.showGlobalOptions) return [];
			const globalOptions = [];
			for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
				const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
				globalOptions.push(...visibleOptions);
			}
			if (this.sortOptions) globalOptions.sort(this.compareOptions);
			return globalOptions;
		}
		/**
		* Get an array of the arguments if any have a description.
		*
		* @param {Command} cmd
		* @returns {Argument[]}
		*/
		visibleArguments(cmd) {
			if (cmd._argsDescription) cmd.registeredArguments.forEach((argument) => {
				argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
			});
			if (cmd.registeredArguments.find((argument) => argument.description)) return cmd.registeredArguments;
			return [];
		}
		/**
		* Get the command term to show in the list of subcommands.
		*
		* @param {Command} cmd
		* @returns {string}
		*/
		subcommandTerm(cmd) {
			const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
			return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
		}
		/**
		* Get the option term to show in the list of options.
		*
		* @param {Option} option
		* @returns {string}
		*/
		optionTerm(option) {
			return option.flags;
		}
		/**
		* Get the argument term to show in the list of arguments.
		*
		* @param {Argument} argument
		* @returns {string}
		*/
		argumentTerm(argument) {
			return argument.name();
		}
		/**
		* Get the longest command term length.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {number}
		*/
		longestSubcommandTermLength(cmd, helper) {
			return helper.visibleCommands(cmd).reduce((max, command) => {
				return Math.max(max, this.displayWidth(helper.styleSubcommandTerm(helper.subcommandTerm(command))));
			}, 0);
		}
		/**
		* Get the longest option term length.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {number}
		*/
		longestOptionTermLength(cmd, helper) {
			return helper.visibleOptions(cmd).reduce((max, option) => {
				return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
			}, 0);
		}
		/**
		* Get the longest global option term length.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {number}
		*/
		longestGlobalOptionTermLength(cmd, helper) {
			return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
				return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
			}, 0);
		}
		/**
		* Get the longest argument term length.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {number}
		*/
		longestArgumentTermLength(cmd, helper) {
			return helper.visibleArguments(cmd).reduce((max, argument) => {
				return Math.max(max, this.displayWidth(helper.styleArgumentTerm(helper.argumentTerm(argument))));
			}, 0);
		}
		/**
		* Get the command usage to be displayed at the top of the built-in help.
		*
		* @param {Command} cmd
		* @returns {string}
		*/
		commandUsage(cmd) {
			let cmdName = cmd._name;
			if (cmd._aliases[0]) cmdName = cmdName + "|" + cmd._aliases[0];
			let ancestorCmdNames = "";
			for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
			return ancestorCmdNames + cmdName + " " + cmd.usage();
		}
		/**
		* Get the description for the command.
		*
		* @param {Command} cmd
		* @returns {string}
		*/
		commandDescription(cmd) {
			return cmd.description();
		}
		/**
		* Get the subcommand summary to show in the list of subcommands.
		* (Fallback to description for backwards compatibility.)
		*
		* @param {Command} cmd
		* @returns {string}
		*/
		subcommandDescription(cmd) {
			return cmd.summary() || cmd.description();
		}
		/**
		* Get the option description to show in the list of options.
		*
		* @param {Option} option
		* @return {string}
		*/
		optionDescription(option) {
			const extraInfo = [];
			if (option.argChoices) extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
			if (option.defaultValue !== void 0) {
				if (option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean") extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
			}
			if (option.presetArg !== void 0 && option.optional) extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
			if (option.envVar !== void 0) extraInfo.push(`env: ${option.envVar}`);
			if (extraInfo.length > 0) {
				const extraDescription = `(${extraInfo.join(", ")})`;
				if (option.description) return `${option.description} ${extraDescription}`;
				return extraDescription;
			}
			return option.description;
		}
		/**
		* Get the argument description to show in the list of arguments.
		*
		* @param {Argument} argument
		* @return {string}
		*/
		argumentDescription(argument) {
			const extraInfo = [];
			if (argument.argChoices) extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
			if (argument.defaultValue !== void 0) extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
			if (extraInfo.length > 0) {
				const extraDescription = `(${extraInfo.join(", ")})`;
				if (argument.description) return `${argument.description} ${extraDescription}`;
				return extraDescription;
			}
			return argument.description;
		}
		/**
		* Format a list of items, given a heading and an array of formatted items.
		*
		* @param {string} heading
		* @param {string[]} items
		* @param {Help} helper
		* @returns string[]
		*/
		formatItemList(heading, items, helper) {
			if (items.length === 0) return [];
			return [
				helper.styleTitle(heading),
				...items,
				""
			];
		}
		/**
		* Group items by their help group heading.
		*
		* @param {Command[] | Option[]} unsortedItems
		* @param {Command[] | Option[]} visibleItems
		* @param {Function} getGroup
		* @returns {Map<string, Command[] | Option[]>}
		*/
		groupItems(unsortedItems, visibleItems, getGroup) {
			const result = /* @__PURE__ */ new Map();
			unsortedItems.forEach((item) => {
				const group = getGroup(item);
				if (!result.has(group)) result.set(group, []);
			});
			visibleItems.forEach((item) => {
				const group = getGroup(item);
				if (!result.has(group)) result.set(group, []);
				result.get(group).push(item);
			});
			return result;
		}
		/**
		* Generate the built-in help text.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {string}
		*/
		formatHelp(cmd, helper) {
			const termWidth = helper.padWidth(cmd, helper);
			const helpWidth = helper.helpWidth ?? 80;
			function callFormatItem(term, description) {
				return helper.formatItem(term, termWidth, description, helper);
			}
			let output = [`${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`, ""];
			const commandDescription = helper.commandDescription(cmd);
			if (commandDescription.length > 0) output = output.concat([helper.boxWrap(helper.styleCommandDescription(commandDescription), helpWidth), ""]);
			const argumentList = helper.visibleArguments(cmd).map((argument) => {
				return callFormatItem(helper.styleArgumentTerm(helper.argumentTerm(argument)), helper.styleArgumentDescription(helper.argumentDescription(argument)));
			});
			output = output.concat(this.formatItemList("Arguments:", argumentList, helper));
			this.groupItems(cmd.options, helper.visibleOptions(cmd), (option) => option.helpGroupHeading ?? "Options:").forEach((options, group) => {
				const optionList = options.map((option) => {
					return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
				});
				output = output.concat(this.formatItemList(group, optionList, helper));
			});
			if (helper.showGlobalOptions) {
				const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
					return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
				});
				output = output.concat(this.formatItemList("Global Options:", globalOptionList, helper));
			}
			this.groupItems(cmd.commands, helper.visibleCommands(cmd), (sub) => sub.helpGroup() || "Commands:").forEach((commands, group) => {
				const commandList = commands.map((sub) => {
					return callFormatItem(helper.styleSubcommandTerm(helper.subcommandTerm(sub)), helper.styleSubcommandDescription(helper.subcommandDescription(sub)));
				});
				output = output.concat(this.formatItemList(group, commandList, helper));
			});
			return output.join("\n");
		}
		/**
		* Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
		*
		* @param {string} str
		* @returns {number}
		*/
		displayWidth(str) {
			return stripColor(str).length;
		}
		/**
		* Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
		*
		* @param {string} str
		* @returns {string}
		*/
		styleTitle(str) {
			return str;
		}
		styleUsage(str) {
			return str.split(" ").map((word) => {
				if (word === "[options]") return this.styleOptionText(word);
				if (word === "[command]") return this.styleSubcommandText(word);
				if (word[0] === "[" || word[0] === "<") return this.styleArgumentText(word);
				return this.styleCommandText(word);
			}).join(" ");
		}
		styleCommandDescription(str) {
			return this.styleDescriptionText(str);
		}
		styleOptionDescription(str) {
			return this.styleDescriptionText(str);
		}
		styleSubcommandDescription(str) {
			return this.styleDescriptionText(str);
		}
		styleArgumentDescription(str) {
			return this.styleDescriptionText(str);
		}
		styleDescriptionText(str) {
			return str;
		}
		styleOptionTerm(str) {
			return this.styleOptionText(str);
		}
		styleSubcommandTerm(str) {
			return str.split(" ").map((word) => {
				if (word === "[options]") return this.styleOptionText(word);
				if (word[0] === "[" || word[0] === "<") return this.styleArgumentText(word);
				return this.styleSubcommandText(word);
			}).join(" ");
		}
		styleArgumentTerm(str) {
			return this.styleArgumentText(str);
		}
		styleOptionText(str) {
			return str;
		}
		styleArgumentText(str) {
			return str;
		}
		styleSubcommandText(str) {
			return str;
		}
		styleCommandText(str) {
			return str;
		}
		/**
		* Calculate the pad width from the maximum term length.
		*
		* @param {Command} cmd
		* @param {Help} helper
		* @returns {number}
		*/
		padWidth(cmd, helper) {
			return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
		}
		/**
		* Detect manually wrapped and indented strings by checking for line break followed by whitespace.
		*
		* @param {string} str
		* @returns {boolean}
		*/
		preformatted(str) {
			return /\n[^\S\r\n]/.test(str);
		}
		/**
		* Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
		*
		* So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
		*   TTT  DDD DDDD
		*        DD DDD
		*
		* @param {string} term
		* @param {number} termWidth
		* @param {string} description
		* @param {Help} helper
		* @returns {string}
		*/
		formatItem(term, termWidth, description, helper) {
			const itemIndent = 2;
			const itemIndentStr = " ".repeat(itemIndent);
			if (!description) return itemIndentStr + term;
			const paddedTerm = term.padEnd(termWidth + term.length - helper.displayWidth(term));
			const spacerWidth = 2;
			const remainingWidth = (this.helpWidth ?? 80) - termWidth - spacerWidth - itemIndent;
			let formattedDescription;
			if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) formattedDescription = description;
			else formattedDescription = helper.boxWrap(description, remainingWidth).replace(/\n/g, "\n" + " ".repeat(termWidth + spacerWidth));
			return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `\n${itemIndentStr}`);
		}
		/**
		* Wrap a string at whitespace, preserving existing line breaks.
		* Wrapping is skipped if the width is less than `minWidthToWrap`.
		*
		* @param {string} str
		* @param {number} width
		* @returns {string}
		*/
		boxWrap(str, width) {
			if (width < this.minWidthToWrap) return str;
			const rawLines = str.split(/\r\n|\n/);
			const chunkPattern = /[\s]*[^\s]+/g;
			const wrappedLines = [];
			rawLines.forEach((line) => {
				const chunks = line.match(chunkPattern);
				if (chunks === null) {
					wrappedLines.push("");
					return;
				}
				let sumChunks = [chunks.shift()];
				let sumWidth = this.displayWidth(sumChunks[0]);
				chunks.forEach((chunk) => {
					const visibleWidth = this.displayWidth(chunk);
					if (sumWidth + visibleWidth <= width) {
						sumChunks.push(chunk);
						sumWidth += visibleWidth;
						return;
					}
					wrappedLines.push(sumChunks.join(""));
					const nextChunk = chunk.trimStart();
					sumChunks = [nextChunk];
					sumWidth = this.displayWidth(nextChunk);
				});
				wrappedLines.push(sumChunks.join(""));
			});
			return wrappedLines.join("\n");
		}
	};
	/**
	* Strip style ANSI escape sequences from the string. In particular, SGR (Select Graphic Rendition) codes.
	*
	* @param {string} str
	* @returns {string}
	* @package
	*/
	function stripColor(str) {
		return str.replace(/\x1b\[\d*(;\d*)*m/g, "");
	}
	exports.Help = Help;
	exports.stripColor = stripColor;
}));
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/option.js
var require_option = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { InvalidArgumentError } = require_error();
	var Option = class {
		/**
		* Initialize a new `Option` with the given `flags` and `description`.
		*
		* @param {string} flags
		* @param {string} [description]
		*/
		constructor(flags, description) {
			this.flags = flags;
			this.description = description || "";
			this.required = flags.includes("<");
			this.optional = flags.includes("[");
			this.variadic = /\w\.\.\.[>\]]$/.test(flags);
			this.mandatory = false;
			const optionFlags = splitOptionFlags(flags);
			this.short = optionFlags.shortFlag;
			this.long = optionFlags.longFlag;
			this.negate = false;
			if (this.long) this.negate = this.long.startsWith("--no-");
			this.defaultValue = void 0;
			this.defaultValueDescription = void 0;
			this.presetArg = void 0;
			this.envVar = void 0;
			this.parseArg = void 0;
			this.hidden = false;
			this.argChoices = void 0;
			this.conflictsWith = [];
			this.implied = void 0;
			this.helpGroupHeading = void 0;
		}
		/**
		* Set the default value, and optionally supply the description to be displayed in the help.
		*
		* @param {*} value
		* @param {string} [description]
		* @return {Option}
		*/
		default(value, description) {
			this.defaultValue = value;
			this.defaultValueDescription = description;
			return this;
		}
		/**
		* Preset to use when option used without option-argument, especially optional but also boolean and negated.
		* The custom processing (parseArg) is called.
		*
		* @example
		* new Option('--color').default('GREYSCALE').preset('RGB');
		* new Option('--donate [amount]').preset('20').argParser(parseFloat);
		*
		* @param {*} arg
		* @return {Option}
		*/
		preset(arg) {
			this.presetArg = arg;
			return this;
		}
		/**
		* Add option name(s) that conflict with this option.
		* An error will be displayed if conflicting options are found during parsing.
		*
		* @example
		* new Option('--rgb').conflicts('cmyk');
		* new Option('--js').conflicts(['ts', 'jsx']);
		*
		* @param {(string | string[])} names
		* @return {Option}
		*/
		conflicts(names) {
			this.conflictsWith = this.conflictsWith.concat(names);
			return this;
		}
		/**
		* Specify implied option values for when this option is set and the implied options are not.
		*
		* The custom processing (parseArg) is not called on the implied values.
		*
		* @example
		* program
		*   .addOption(new Option('--log', 'write logging information to file'))
		*   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
		*
		* @param {object} impliedOptionValues
		* @return {Option}
		*/
		implies(impliedOptionValues) {
			let newImplied = impliedOptionValues;
			if (typeof impliedOptionValues === "string") newImplied = { [impliedOptionValues]: true };
			this.implied = Object.assign(this.implied || {}, newImplied);
			return this;
		}
		/**
		* Set environment variable to check for option value.
		*
		* An environment variable is only used if when processed the current option value is
		* undefined, or the source of the current value is 'default' or 'config' or 'env'.
		*
		* @param {string} name
		* @return {Option}
		*/
		env(name) {
			this.envVar = name;
			return this;
		}
		/**
		* Set the custom handler for processing CLI option arguments into option values.
		*
		* @param {Function} [fn]
		* @return {Option}
		*/
		argParser(fn) {
			this.parseArg = fn;
			return this;
		}
		/**
		* Whether the option is mandatory and must have a value after parsing.
		*
		* @param {boolean} [mandatory=true]
		* @return {Option}
		*/
		makeOptionMandatory(mandatory = true) {
			this.mandatory = !!mandatory;
			return this;
		}
		/**
		* Hide option in help.
		*
		* @param {boolean} [hide=true]
		* @return {Option}
		*/
		hideHelp(hide = true) {
			this.hidden = !!hide;
			return this;
		}
		/**
		* @package
		*/
		_collectValue(value, previous) {
			if (previous === this.defaultValue || !Array.isArray(previous)) return [value];
			previous.push(value);
			return previous;
		}
		/**
		* Only allow option value to be one of choices.
		*
		* @param {string[]} values
		* @return {Option}
		*/
		choices(values) {
			this.argChoices = values.slice();
			this.parseArg = (arg, previous) => {
				if (!this.argChoices.includes(arg)) throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
				if (this.variadic) return this._collectValue(arg, previous);
				return arg;
			};
			return this;
		}
		/**
		* Return option name.
		*
		* @return {string}
		*/
		name() {
			if (this.long) return this.long.replace(/^--/, "");
			return this.short.replace(/^-/, "");
		}
		/**
		* Return option name, in a camelcase format that can be used
		* as an object attribute key.
		*
		* @return {string}
		*/
		attributeName() {
			if (this.negate) return camelcase(this.name().replace(/^no-/, ""));
			return camelcase(this.name());
		}
		/**
		* Set the help group heading.
		*
		* @param {string} heading
		* @return {Option}
		*/
		helpGroup(heading) {
			this.helpGroupHeading = heading;
			return this;
		}
		/**
		* Check if `arg` matches the short or long flag.
		*
		* @param {string} arg
		* @return {boolean}
		* @package
		*/
		is(arg) {
			return this.short === arg || this.long === arg;
		}
		/**
		* Return whether a boolean option.
		*
		* Options are one of boolean, negated, required argument, or optional argument.
		*
		* @return {boolean}
		* @package
		*/
		isBoolean() {
			return !this.required && !this.optional && !this.negate;
		}
	};
	/**
	* This class is to make it easier to work with dual options, without changing the existing
	* implementation. We support separate dual options for separate positive and negative options,
	* like `--build` and `--no-build`, which share a single option value. This works nicely for some
	* use cases, but is tricky for others where we want separate behaviours despite
	* the single shared option value.
	*/
	var DualOptions = class {
		/**
		* @param {Option[]} options
		*/
		constructor(options) {
			this.positiveOptions = /* @__PURE__ */ new Map();
			this.negativeOptions = /* @__PURE__ */ new Map();
			this.dualOptions = /* @__PURE__ */ new Set();
			options.forEach((option) => {
				if (option.negate) this.negativeOptions.set(option.attributeName(), option);
				else this.positiveOptions.set(option.attributeName(), option);
			});
			this.negativeOptions.forEach((value, key) => {
				if (this.positiveOptions.has(key)) this.dualOptions.add(key);
			});
		}
		/**
		* Did the value come from the option, and not from possible matching dual option?
		*
		* @param {*} value
		* @param {Option} option
		* @returns {boolean}
		*/
		valueFromOption(value, option) {
			const optionKey = option.attributeName();
			if (!this.dualOptions.has(optionKey)) return true;
			const preset = this.negativeOptions.get(optionKey).presetArg;
			const negativeValue = preset !== void 0 ? preset : false;
			return option.negate === (negativeValue === value);
		}
	};
	/**
	* Convert string from kebab-case to camelCase.
	*
	* @param {string} str
	* @return {string}
	* @private
	*/
	function camelcase(str) {
		return str.split("-").reduce((str, word) => {
			return str + word[0].toUpperCase() + word.slice(1);
		});
	}
	/**
	* Split the short and long flag out of something like '-m,--mixed <value>'
	*
	* @private
	*/
	function splitOptionFlags(flags) {
		let shortFlag;
		let longFlag;
		const shortFlagExp = /^-[^-]$/;
		const longFlagExp = /^--[^-]/;
		const flagParts = flags.split(/[ |,]+/).concat("guard");
		if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
		if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
		if (!shortFlag && shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
		if (!shortFlag && longFlagExp.test(flagParts[0])) {
			shortFlag = longFlag;
			longFlag = flagParts.shift();
		}
		if (flagParts[0].startsWith("-")) {
			const unsupportedFlag = flagParts[0];
			const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
			if (/^-[^-][^-]/.test(unsupportedFlag)) throw new Error(`${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`);
			if (shortFlagExp.test(unsupportedFlag)) throw new Error(`${baseError}
- too many short flags`);
			if (longFlagExp.test(unsupportedFlag)) throw new Error(`${baseError}
- too many long flags`);
			throw new Error(`${baseError}
- unrecognised flag format`);
		}
		if (shortFlag === void 0 && longFlag === void 0) throw new Error(`option creation failed due to no flags found in '${flags}'.`);
		return {
			shortFlag,
			longFlag
		};
	}
	exports.Option = Option;
	exports.DualOptions = DualOptions;
}));
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = /* @__PURE__ */ __commonJSMin(((exports) => {
	const maxDistance = 3;
	function editDistance(a, b) {
		if (Math.abs(a.length - b.length) > maxDistance) return Math.max(a.length, b.length);
		const d = [];
		for (let i = 0; i <= a.length; i++) d[i] = [i];
		for (let j = 0; j <= b.length; j++) d[0][j] = j;
		for (let j = 1; j <= b.length; j++) for (let i = 1; i <= a.length; i++) {
			let cost = 1;
			if (a[i - 1] === b[j - 1]) cost = 0;
			else cost = 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
		}
		return d[a.length][b.length];
	}
	/**
	* Find close matches, restricted to same number of edits.
	*
	* @param {string} word
	* @param {string[]} candidates
	* @returns {string}
	*/
	function suggestSimilar(word, candidates) {
		if (!candidates || candidates.length === 0) return "";
		candidates = Array.from(new Set(candidates));
		const searchingOptions = word.startsWith("--");
		if (searchingOptions) {
			word = word.slice(2);
			candidates = candidates.map((candidate) => candidate.slice(2));
		}
		let similar = [];
		let bestDistance = maxDistance;
		const minSimilarity = .4;
		candidates.forEach((candidate) => {
			if (candidate.length <= 1) return;
			const distance = editDistance(word, candidate);
			const length = Math.max(word.length, candidate.length);
			if ((length - distance) / length > minSimilarity) {
				if (distance < bestDistance) {
					bestDistance = distance;
					similar = [candidate];
				} else if (distance === bestDistance) similar.push(candidate);
			}
		});
		similar.sort((a, b) => a.localeCompare(b));
		if (searchingOptions) similar = similar.map((candidate) => `--${candidate}`);
		if (similar.length > 1) return `\n(Did you mean one of ${similar.join(", ")}?)`;
		if (similar.length === 1) return `\n(Did you mean ${similar[0]}?)`;
		return "";
	}
	exports.suggestSimilar = suggestSimilar;
}));
//#endregion
//#region ../../node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/command.js
var require_command = /* @__PURE__ */ __commonJSMin(((exports) => {
	const EventEmitter = __require("node:events").EventEmitter;
	const childProcess = __require("node:child_process");
	const path = __require("node:path");
	const fs = __require("node:fs");
	const process$1 = __require("node:process");
	const { Argument, humanReadableArgName } = require_argument();
	const { CommanderError } = require_error();
	const { Help, stripColor } = require_help();
	const { Option, DualOptions } = require_option();
	const { suggestSimilar } = require_suggestSimilar();
	var Command = class Command extends EventEmitter {
		/**
		* Initialize a new `Command`.
		*
		* @param {string} [name]
		*/
		constructor(name) {
			super();
			/** @type {Command[]} */
			this.commands = [];
			/** @type {Option[]} */
			this.options = [];
			this.parent = null;
			this._allowUnknownOption = false;
			this._allowExcessArguments = false;
			/** @type {Argument[]} */
			this.registeredArguments = [];
			this._args = this.registeredArguments;
			/** @type {string[]} */
			this.args = [];
			this.rawArgs = [];
			this.processedArgs = [];
			this._scriptPath = null;
			this._name = name || "";
			this._optionValues = {};
			this._optionValueSources = {};
			this._storeOptionsAsProperties = false;
			this._actionHandler = null;
			this._executableHandler = false;
			this._executableFile = null;
			this._executableDir = null;
			this._defaultCommandName = null;
			this._exitCallback = null;
			this._aliases = [];
			this._combineFlagAndOptionalValue = true;
			this._description = "";
			this._summary = "";
			this._argsDescription = void 0;
			this._enablePositionalOptions = false;
			this._passThroughOptions = false;
			this._lifeCycleHooks = {};
			/** @type {(boolean | string)} */
			this._showHelpAfterError = false;
			this._showSuggestionAfterError = true;
			this._savedState = null;
			this._outputConfiguration = {
				writeOut: (str) => process$1.stdout.write(str),
				writeErr: (str) => process$1.stderr.write(str),
				outputError: (str, write) => write(str),
				getOutHelpWidth: () => process$1.stdout.isTTY ? process$1.stdout.columns : void 0,
				getErrHelpWidth: () => process$1.stderr.isTTY ? process$1.stderr.columns : void 0,
				getOutHasColors: () => useColor() ?? (process$1.stdout.isTTY && process$1.stdout.hasColors?.()),
				getErrHasColors: () => useColor() ?? (process$1.stderr.isTTY && process$1.stderr.hasColors?.()),
				stripColor: (str) => stripColor(str)
			};
			this._hidden = false;
			/** @type {(Option | null | undefined)} */
			this._helpOption = void 0;
			this._addImplicitHelpCommand = void 0;
			/** @type {Command} */
			this._helpCommand = void 0;
			this._helpConfiguration = {};
			/** @type {string | undefined} */
			this._helpGroupHeading = void 0;
			/** @type {string | undefined} */
			this._defaultCommandGroup = void 0;
			/** @type {string | undefined} */
			this._defaultOptionGroup = void 0;
		}
		/**
		* Copy settings that are useful to have in common across root command and subcommands.
		*
		* (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
		*
		* @param {Command} sourceCommand
		* @return {Command} `this` command for chaining
		*/
		copyInheritedSettings(sourceCommand) {
			this._outputConfiguration = sourceCommand._outputConfiguration;
			this._helpOption = sourceCommand._helpOption;
			this._helpCommand = sourceCommand._helpCommand;
			this._helpConfiguration = sourceCommand._helpConfiguration;
			this._exitCallback = sourceCommand._exitCallback;
			this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
			this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
			this._allowExcessArguments = sourceCommand._allowExcessArguments;
			this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
			this._showHelpAfterError = sourceCommand._showHelpAfterError;
			this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
			return this;
		}
		/**
		* @returns {Command[]}
		* @private
		*/
		_getCommandAndAncestors() {
			const result = [];
			for (let command = this; command; command = command.parent) result.push(command);
			return result;
		}
		/**
		* Define a command.
		*
		* There are two styles of command: pay attention to where to put the description.
		*
		* @example
		* // Command implemented using action handler (description is supplied separately to `.command`)
		* program
		*   .command('clone <source> [destination]')
		*   .description('clone a repository into a newly created directory')
		*   .action((source, destination) => {
		*     console.log('clone command called');
		*   });
		*
		* // Command implemented using separate executable file (description is second parameter to `.command`)
		* program
		*   .command('start <service>', 'start named service')
		*   .command('stop [service]', 'stop named service, or all if no name supplied');
		*
		* @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
		* @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
		* @param {object} [execOpts] - configuration options (for executable)
		* @return {Command} returns new command for action handler, or `this` for executable command
		*/
		command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
			let desc = actionOptsOrExecDesc;
			let opts = execOpts;
			if (typeof desc === "object" && desc !== null) {
				opts = desc;
				desc = null;
			}
			opts = opts || {};
			const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
			const cmd = this.createCommand(name);
			if (desc) {
				cmd.description(desc);
				cmd._executableHandler = true;
			}
			if (opts.isDefault) this._defaultCommandName = cmd._name;
			cmd._hidden = !!(opts.noHelp || opts.hidden);
			cmd._executableFile = opts.executableFile || null;
			if (args) cmd.arguments(args);
			this._registerCommand(cmd);
			cmd.parent = this;
			cmd.copyInheritedSettings(this);
			if (desc) return this;
			return cmd;
		}
		/**
		* Factory routine to create a new unattached command.
		*
		* See .command() for creating an attached subcommand, which uses this routine to
		* create the command. You can override createCommand to customise subcommands.
		*
		* @param {string} [name]
		* @return {Command} new command
		*/
		createCommand(name) {
			return new Command(name);
		}
		/**
		* You can customise the help with a subclass of Help by overriding createHelp,
		* or by overriding Help properties using configureHelp().
		*
		* @return {Help}
		*/
		createHelp() {
			return Object.assign(new Help(), this.configureHelp());
		}
		/**
		* You can customise the help by overriding Help properties using configureHelp(),
		* or with a subclass of Help by overriding createHelp().
		*
		* @param {object} [configuration] - configuration options
		* @return {(Command | object)} `this` command for chaining, or stored configuration
		*/
		configureHelp(configuration) {
			if (configuration === void 0) return this._helpConfiguration;
			this._helpConfiguration = configuration;
			return this;
		}
		/**
		* The default output goes to stdout and stderr. You can customise this for special
		* applications. You can also customise the display of errors by overriding outputError.
		*
		* The configuration properties are all functions:
		*
		*     // change how output being written, defaults to stdout and stderr
		*     writeOut(str)
		*     writeErr(str)
		*     // change how output being written for errors, defaults to writeErr
		*     outputError(str, write) // used for displaying errors and not used for displaying help
		*     // specify width for wrapping help
		*     getOutHelpWidth()
		*     getErrHelpWidth()
		*     // color support, currently only used with Help
		*     getOutHasColors()
		*     getErrHasColors()
		*     stripColor() // used to remove ANSI escape codes if output does not have colors
		*
		* @param {object} [configuration] - configuration options
		* @return {(Command | object)} `this` command for chaining, or stored configuration
		*/
		configureOutput(configuration) {
			if (configuration === void 0) return this._outputConfiguration;
			this._outputConfiguration = {
				...this._outputConfiguration,
				...configuration
			};
			return this;
		}
		/**
		* Display the help or a custom message after an error occurs.
		*
		* @param {(boolean|string)} [displayHelp]
		* @return {Command} `this` command for chaining
		*/
		showHelpAfterError(displayHelp = true) {
			if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
			this._showHelpAfterError = displayHelp;
			return this;
		}
		/**
		* Display suggestion of similar commands for unknown commands, or options for unknown options.
		*
		* @param {boolean} [displaySuggestion]
		* @return {Command} `this` command for chaining
		*/
		showSuggestionAfterError(displaySuggestion = true) {
			this._showSuggestionAfterError = !!displaySuggestion;
			return this;
		}
		/**
		* Add a prepared subcommand.
		*
		* See .command() for creating an attached subcommand which inherits settings from its parent.
		*
		* @param {Command} cmd - new subcommand
		* @param {object} [opts] - configuration options
		* @return {Command} `this` command for chaining
		*/
		addCommand(cmd, opts) {
			if (!cmd._name) throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
			opts = opts || {};
			if (opts.isDefault) this._defaultCommandName = cmd._name;
			if (opts.noHelp || opts.hidden) cmd._hidden = true;
			this._registerCommand(cmd);
			cmd.parent = this;
			cmd._checkForBrokenPassThrough();
			return this;
		}
		/**
		* Factory routine to create a new unattached argument.
		*
		* See .argument() for creating an attached argument, which uses this routine to
		* create the argument. You can override createArgument to return a custom argument.
		*
		* @param {string} name
		* @param {string} [description]
		* @return {Argument} new argument
		*/
		createArgument(name, description) {
			return new Argument(name, description);
		}
		/**
		* Define argument syntax for command.
		*
		* The default is that the argument is required, and you can explicitly
		* indicate this with <> around the name. Put [] around the name for an optional argument.
		*
		* @example
		* program.argument('<input-file>');
		* program.argument('[output-file]');
		*
		* @param {string} name
		* @param {string} [description]
		* @param {(Function|*)} [parseArg] - custom argument processing function or default value
		* @param {*} [defaultValue]
		* @return {Command} `this` command for chaining
		*/
		argument(name, description, parseArg, defaultValue) {
			const argument = this.createArgument(name, description);
			if (typeof parseArg === "function") argument.default(defaultValue).argParser(parseArg);
			else argument.default(parseArg);
			this.addArgument(argument);
			return this;
		}
		/**
		* Define argument syntax for command, adding multiple at once (without descriptions).
		*
		* See also .argument().
		*
		* @example
		* program.arguments('<cmd> [env]');
		*
		* @param {string} names
		* @return {Command} `this` command for chaining
		*/
		arguments(names) {
			names.trim().split(/ +/).forEach((detail) => {
				this.argument(detail);
			});
			return this;
		}
		/**
		* Define argument syntax for command, adding a prepared argument.
		*
		* @param {Argument} argument
		* @return {Command} `this` command for chaining
		*/
		addArgument(argument) {
			const previousArgument = this.registeredArguments.slice(-1)[0];
			if (previousArgument?.variadic) throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
			if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
			this.registeredArguments.push(argument);
			return this;
		}
		/**
		* Customise or override default help command. By default a help command is automatically added if your command has subcommands.
		*
		* @example
		*    program.helpCommand('help [cmd]');
		*    program.helpCommand('help [cmd]', 'show help');
		*    program.helpCommand(false); // suppress default help command
		*    program.helpCommand(true); // add help command even if no subcommands
		*
		* @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
		* @param {string} [description] - custom description
		* @return {Command} `this` command for chaining
		*/
		helpCommand(enableOrNameAndArgs, description) {
			if (typeof enableOrNameAndArgs === "boolean") {
				this._addImplicitHelpCommand = enableOrNameAndArgs;
				if (enableOrNameAndArgs && this._defaultCommandGroup) this._initCommandGroup(this._getHelpCommand());
				return this;
			}
			const [, helpName, helpArgs] = (enableOrNameAndArgs ?? "help [command]").match(/([^ ]+) *(.*)/);
			const helpDescription = description ?? "display help for command";
			const helpCommand = this.createCommand(helpName);
			helpCommand.helpOption(false);
			if (helpArgs) helpCommand.arguments(helpArgs);
			if (helpDescription) helpCommand.description(helpDescription);
			this._addImplicitHelpCommand = true;
			this._helpCommand = helpCommand;
			if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
			return this;
		}
		/**
		* Add prepared custom help command.
		*
		* @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
		* @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
		* @return {Command} `this` command for chaining
		*/
		addHelpCommand(helpCommand, deprecatedDescription) {
			if (typeof helpCommand !== "object") {
				this.helpCommand(helpCommand, deprecatedDescription);
				return this;
			}
			this._addImplicitHelpCommand = true;
			this._helpCommand = helpCommand;
			this._initCommandGroup(helpCommand);
			return this;
		}
		/**
		* Lazy create help command.
		*
		* @return {(Command|null)}
		* @package
		*/
		_getHelpCommand() {
			if (this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"))) {
				if (this._helpCommand === void 0) this.helpCommand(void 0, void 0);
				return this._helpCommand;
			}
			return null;
		}
		/**
		* Add hook for life cycle event.
		*
		* @param {string} event
		* @param {Function} listener
		* @return {Command} `this` command for chaining
		*/
		hook(event, listener) {
			const allowedValues = [
				"preSubcommand",
				"preAction",
				"postAction"
			];
			if (!allowedValues.includes(event)) throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
			if (this._lifeCycleHooks[event]) this._lifeCycleHooks[event].push(listener);
			else this._lifeCycleHooks[event] = [listener];
			return this;
		}
		/**
		* Register callback to use as replacement for calling process.exit.
		*
		* @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
		* @return {Command} `this` command for chaining
		*/
		exitOverride(fn) {
			if (fn) this._exitCallback = fn;
			else this._exitCallback = (err) => {
				if (err.code !== "commander.executeSubCommandAsync") throw err;
			};
			return this;
		}
		/**
		* Call process.exit, and _exitCallback if defined.
		*
		* @param {number} exitCode exit code for using with process.exit
		* @param {string} code an id string representing the error
		* @param {string} message human-readable description of the error
		* @return never
		* @private
		*/
		_exit(exitCode, code, message) {
			if (this._exitCallback) this._exitCallback(new CommanderError(exitCode, code, message));
			process$1.exit(exitCode);
		}
		/**
		* Register callback `fn` for the command.
		*
		* @example
		* program
		*   .command('serve')
		*   .description('start service')
		*   .action(function() {
		*      // do work here
		*   });
		*
		* @param {Function} fn
		* @return {Command} `this` command for chaining
		*/
		action(fn) {
			const listener = (args) => {
				const expectedArgsCount = this.registeredArguments.length;
				const actionArgs = args.slice(0, expectedArgsCount);
				if (this._storeOptionsAsProperties) actionArgs[expectedArgsCount] = this;
				else actionArgs[expectedArgsCount] = this.opts();
				actionArgs.push(this);
				return fn.apply(this, actionArgs);
			};
			this._actionHandler = listener;
			return this;
		}
		/**
		* Factory routine to create a new unattached option.
		*
		* See .option() for creating an attached option, which uses this routine to
		* create the option. You can override createOption to return a custom option.
		*
		* @param {string} flags
		* @param {string} [description]
		* @return {Option} new option
		*/
		createOption(flags, description) {
			return new Option(flags, description);
		}
		/**
		* Wrap parseArgs to catch 'commander.invalidArgument'.
		*
		* @param {(Option | Argument)} target
		* @param {string} value
		* @param {*} previous
		* @param {string} invalidArgumentMessage
		* @private
		*/
		_callParseArg(target, value, previous, invalidArgumentMessage) {
			try {
				return target.parseArg(value, previous);
			} catch (err) {
				if (err.code === "commander.invalidArgument") {
					const message = `${invalidArgumentMessage} ${err.message}`;
					this.error(message, {
						exitCode: err.exitCode,
						code: err.code
					});
				}
				throw err;
			}
		}
		/**
		* Check for option flag conflicts.
		* Register option if no conflicts found, or throw on conflict.
		*
		* @param {Option} option
		* @private
		*/
		_registerOption(option) {
			const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
			if (matchingOption) {
				const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
				throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
			}
			this._initOptionGroup(option);
			this.options.push(option);
		}
		/**
		* Check for command name and alias conflicts with existing commands.
		* Register command if no conflicts found, or throw on conflict.
		*
		* @param {Command} command
		* @private
		*/
		_registerCommand(command) {
			const knownBy = (cmd) => {
				return [cmd.name()].concat(cmd.aliases());
			};
			const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
			if (alreadyUsed) {
				const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
				const newCmd = knownBy(command).join("|");
				throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
			}
			this._initCommandGroup(command);
			this.commands.push(command);
		}
		/**
		* Add an option.
		*
		* @param {Option} option
		* @return {Command} `this` command for chaining
		*/
		addOption(option) {
			this._registerOption(option);
			const oname = option.name();
			const name = option.attributeName();
			if (option.negate) {
				const positiveLongFlag = option.long.replace(/^--no-/, "--");
				if (!this._findOption(positiveLongFlag)) this.setOptionValueWithSource(name, option.defaultValue === void 0 ? true : option.defaultValue, "default");
			} else if (option.defaultValue !== void 0) this.setOptionValueWithSource(name, option.defaultValue, "default");
			const handleOptionValue = (val, invalidValueMessage, valueSource) => {
				if (val == null && option.presetArg !== void 0) val = option.presetArg;
				const oldValue = this.getOptionValue(name);
				if (val !== null && option.parseArg) val = this._callParseArg(option, val, oldValue, invalidValueMessage);
				else if (val !== null && option.variadic) val = option._collectValue(val, oldValue);
				if (val == null) {
					if (option.negate) val = false;
					else if (option.isBoolean() || option.optional) val = true;
					else val = "";
				}
				this.setOptionValueWithSource(name, val, valueSource);
			};
			this.on("option:" + oname, (val) => {
				const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
				handleOptionValue(val, invalidValueMessage, "cli");
			});
			if (option.envVar) this.on("optionEnv:" + oname, (val) => {
				const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
				handleOptionValue(val, invalidValueMessage, "env");
			});
			return this;
		}
		/**
		* Internal implementation shared by .option() and .requiredOption()
		*
		* @return {Command} `this` command for chaining
		* @private
		*/
		_optionEx(config, flags, description, fn, defaultValue) {
			if (typeof flags === "object" && flags instanceof Option) throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
			const option = this.createOption(flags, description);
			option.makeOptionMandatory(!!config.mandatory);
			if (typeof fn === "function") option.default(defaultValue).argParser(fn);
			else if (fn instanceof RegExp) {
				const regex = fn;
				fn = (val, def) => {
					const m = regex.exec(val);
					return m ? m[0] : def;
				};
				option.default(defaultValue).argParser(fn);
			} else option.default(fn);
			return this.addOption(option);
		}
		/**
		* Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
		*
		* The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
		* option-argument is indicated by `<>` and an optional option-argument by `[]`.
		*
		* See the README for more details, and see also addOption() and requiredOption().
		*
		* @example
		* program
		*     .option('-p, --pepper', 'add pepper')
		*     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
		*     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
		*     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
		*
		* @param {string} flags
		* @param {string} [description]
		* @param {(Function|*)} [parseArg] - custom option processing function or default value
		* @param {*} [defaultValue]
		* @return {Command} `this` command for chaining
		*/
		option(flags, description, parseArg, defaultValue) {
			return this._optionEx({}, flags, description, parseArg, defaultValue);
		}
		/**
		* Add a required option which must have a value after parsing. This usually means
		* the option must be specified on the command line. (Otherwise the same as .option().)
		*
		* The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
		*
		* @param {string} flags
		* @param {string} [description]
		* @param {(Function|*)} [parseArg] - custom option processing function or default value
		* @param {*} [defaultValue]
		* @return {Command} `this` command for chaining
		*/
		requiredOption(flags, description, parseArg, defaultValue) {
			return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
		}
		/**
		* Alter parsing of short flags with optional values.
		*
		* @example
		* // for `.option('-f,--flag [value]'):
		* program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
		* program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
		*
		* @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
		* @return {Command} `this` command for chaining
		*/
		combineFlagAndOptionalValue(combine = true) {
			this._combineFlagAndOptionalValue = !!combine;
			return this;
		}
		/**
		* Allow unknown options on the command line.
		*
		* @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
		* @return {Command} `this` command for chaining
		*/
		allowUnknownOption(allowUnknown = true) {
			this._allowUnknownOption = !!allowUnknown;
			return this;
		}
		/**
		* Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
		*
		* @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
		* @return {Command} `this` command for chaining
		*/
		allowExcessArguments(allowExcess = true) {
			this._allowExcessArguments = !!allowExcess;
			return this;
		}
		/**
		* Enable positional options. Positional means global options are specified before subcommands which lets
		* subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
		* The default behaviour is non-positional and global options may appear anywhere on the command line.
		*
		* @param {boolean} [positional]
		* @return {Command} `this` command for chaining
		*/
		enablePositionalOptions(positional = true) {
			this._enablePositionalOptions = !!positional;
			return this;
		}
		/**
		* Pass through options that come after command-arguments rather than treat them as command-options,
		* so actual command-options come before command-arguments. Turning this on for a subcommand requires
		* positional options to have been enabled on the program (parent commands).
		* The default behaviour is non-positional and options may appear before or after command-arguments.
		*
		* @param {boolean} [passThrough] for unknown options.
		* @return {Command} `this` command for chaining
		*/
		passThroughOptions(passThrough = true) {
			this._passThroughOptions = !!passThrough;
			this._checkForBrokenPassThrough();
			return this;
		}
		/**
		* @private
		*/
		_checkForBrokenPassThrough() {
			if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
		}
		/**
		* Whether to store option values as properties on command object,
		* or store separately (specify false). In both cases the option values can be accessed using .opts().
		*
		* @param {boolean} [storeAsProperties=true]
		* @return {Command} `this` command for chaining
		*/
		storeOptionsAsProperties(storeAsProperties = true) {
			if (this.options.length) throw new Error("call .storeOptionsAsProperties() before adding options");
			if (Object.keys(this._optionValues).length) throw new Error("call .storeOptionsAsProperties() before setting option values");
			this._storeOptionsAsProperties = !!storeAsProperties;
			return this;
		}
		/**
		* Retrieve option value.
		*
		* @param {string} key
		* @return {object} value
		*/
		getOptionValue(key) {
			if (this._storeOptionsAsProperties) return this[key];
			return this._optionValues[key];
		}
		/**
		* Store option value.
		*
		* @param {string} key
		* @param {object} value
		* @return {Command} `this` command for chaining
		*/
		setOptionValue(key, value) {
			return this.setOptionValueWithSource(key, value, void 0);
		}
		/**
		* Store option value and where the value came from.
		*
		* @param {string} key
		* @param {object} value
		* @param {string} source - expected values are default/config/env/cli/implied
		* @return {Command} `this` command for chaining
		*/
		setOptionValueWithSource(key, value, source) {
			if (this._storeOptionsAsProperties) this[key] = value;
			else this._optionValues[key] = value;
			this._optionValueSources[key] = source;
			return this;
		}
		/**
		* Get source of option value.
		* Expected values are default | config | env | cli | implied
		*
		* @param {string} key
		* @return {string}
		*/
		getOptionValueSource(key) {
			return this._optionValueSources[key];
		}
		/**
		* Get source of option value. See also .optsWithGlobals().
		* Expected values are default | config | env | cli | implied
		*
		* @param {string} key
		* @return {string}
		*/
		getOptionValueSourceWithGlobals(key) {
			let source;
			this._getCommandAndAncestors().forEach((cmd) => {
				if (cmd.getOptionValueSource(key) !== void 0) source = cmd.getOptionValueSource(key);
			});
			return source;
		}
		/**
		* Get user arguments from implied or explicit arguments.
		* Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
		*
		* @private
		*/
		_prepareUserArgs(argv, parseOptions) {
			if (argv !== void 0 && !Array.isArray(argv)) throw new Error("first parameter to parse must be array or undefined");
			parseOptions = parseOptions || {};
			if (argv === void 0 && parseOptions.from === void 0) {
				if (process$1.versions?.electron) parseOptions.from = "electron";
				const execArgv = process$1.execArgv ?? [];
				if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) parseOptions.from = "eval";
			}
			if (argv === void 0) argv = process$1.argv;
			this.rawArgs = argv.slice();
			let userArgs;
			switch (parseOptions.from) {
				case void 0:
				case "node":
					this._scriptPath = argv[1];
					userArgs = argv.slice(2);
					break;
				case "electron":
					if (process$1.defaultApp) {
						this._scriptPath = argv[1];
						userArgs = argv.slice(2);
					} else userArgs = argv.slice(1);
					break;
				case "user":
					userArgs = argv.slice(0);
					break;
				case "eval":
					userArgs = argv.slice(1);
					break;
				default: throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
			}
			if (!this._name && this._scriptPath) this.nameFromFilename(this._scriptPath);
			this._name = this._name || "program";
			return userArgs;
		}
		/**
		* Parse `argv`, setting options and invoking commands when defined.
		*
		* Use parseAsync instead of parse if any of your action handlers are async.
		*
		* Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
		*
		* Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
		* - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
		* - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
		* - `'user'`: just user arguments
		*
		* @example
		* program.parse(); // parse process.argv and auto-detect electron and special node flags
		* program.parse(process.argv); // assume argv[0] is app and argv[1] is script
		* program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
		*
		* @param {string[]} [argv] - optional, defaults to process.argv
		* @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
		* @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
		* @return {Command} `this` command for chaining
		*/
		parse(argv, parseOptions) {
			this._prepareForParse();
			const userArgs = this._prepareUserArgs(argv, parseOptions);
			this._parseCommand([], userArgs);
			return this;
		}
		/**
		* Parse `argv`, setting options and invoking commands when defined.
		*
		* Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
		*
		* Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
		* - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
		* - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
		* - `'user'`: just user arguments
		*
		* @example
		* await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
		* await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
		* await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
		*
		* @param {string[]} [argv]
		* @param {object} [parseOptions]
		* @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
		* @return {Promise}
		*/
		async parseAsync(argv, parseOptions) {
			this._prepareForParse();
			const userArgs = this._prepareUserArgs(argv, parseOptions);
			await this._parseCommand([], userArgs);
			return this;
		}
		_prepareForParse() {
			if (this._savedState === null) this.saveStateBeforeParse();
			else this.restoreStateBeforeParse();
		}
		/**
		* Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
		* Not usually called directly, but available for subclasses to save their custom state.
		*
		* This is called in a lazy way. Only commands used in parsing chain will have state saved.
		*/
		saveStateBeforeParse() {
			this._savedState = {
				_name: this._name,
				_optionValues: { ...this._optionValues },
				_optionValueSources: { ...this._optionValueSources }
			};
		}
		/**
		* Restore state before parse for calls after the first.
		* Not usually called directly, but available for subclasses to save their custom state.
		*
		* This is called in a lazy way. Only commands used in parsing chain will have state restored.
		*/
		restoreStateBeforeParse() {
			if (this._storeOptionsAsProperties) throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
			this._name = this._savedState._name;
			this._scriptPath = null;
			this.rawArgs = [];
			this._optionValues = { ...this._savedState._optionValues };
			this._optionValueSources = { ...this._savedState._optionValueSources };
			this.args = [];
			this.processedArgs = [];
		}
		/**
		* Throw if expected executable is missing. Add lots of help for author.
		*
		* @param {string} executableFile
		* @param {string} executableDir
		* @param {string} subcommandName
		*/
		_checkForMissingExecutable(executableFile, executableDir, subcommandName) {
			if (fs.existsSync(executableFile)) return;
			const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory"}`;
			throw new Error(executableMissing);
		}
		/**
		* Execute a sub-command executable.
		*
		* @private
		*/
		_executeSubCommand(subcommand, args) {
			args = args.slice();
			let launchWithNode = false;
			const sourceExt = [
				".js",
				".ts",
				".tsx",
				".mjs",
				".cjs"
			];
			function findFile(baseDir, baseName) {
				const localBin = path.resolve(baseDir, baseName);
				if (fs.existsSync(localBin)) return localBin;
				if (sourceExt.includes(path.extname(baseName))) return void 0;
				const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
				if (foundExt) return `${localBin}${foundExt}`;
			}
			this._checkForMissingMandatoryOptions();
			this._checkForConflictingOptions();
			let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
			let executableDir = this._executableDir || "";
			if (this._scriptPath) {
				let resolvedScriptPath;
				try {
					resolvedScriptPath = fs.realpathSync(this._scriptPath);
				} catch {
					resolvedScriptPath = this._scriptPath;
				}
				executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
			}
			if (executableDir) {
				let localFile = findFile(executableDir, executableFile);
				if (!localFile && !subcommand._executableFile && this._scriptPath) {
					const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
					if (legacyName !== this._name) localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
				}
				executableFile = localFile || executableFile;
			}
			launchWithNode = sourceExt.includes(path.extname(executableFile));
			let proc;
			if (process$1.platform !== "win32") {
				if (launchWithNode) {
					args.unshift(executableFile);
					args = incrementNodeInspectorPort(process$1.execArgv).concat(args);
					proc = childProcess.spawn(process$1.argv[0], args, { stdio: "inherit" });
				} else proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
			} else {
				this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
				args.unshift(executableFile);
				args = incrementNodeInspectorPort(process$1.execArgv).concat(args);
				proc = childProcess.spawn(process$1.execPath, args, { stdio: "inherit" });
			}
			if (!proc.killed) [
				"SIGUSR1",
				"SIGUSR2",
				"SIGTERM",
				"SIGINT",
				"SIGHUP"
			].forEach((signal) => {
				process$1.on(signal, () => {
					if (proc.killed === false && proc.exitCode === null) proc.kill(signal);
				});
			});
			const exitCallback = this._exitCallback;
			proc.on("close", (code) => {
				code = code ?? 1;
				if (!exitCallback) process$1.exit(code);
				else exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
			});
			proc.on("error", (err) => {
				if (err.code === "ENOENT") this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
				else if (err.code === "EACCES") throw new Error(`'${executableFile}' not executable`);
				if (!exitCallback) process$1.exit(1);
				else {
					const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
					wrappedError.nestedError = err;
					exitCallback(wrappedError);
				}
			});
			this.runningCommand = proc;
		}
		/**
		* @private
		*/
		_dispatchSubcommand(commandName, operands, unknown) {
			const subCommand = this._findCommand(commandName);
			if (!subCommand) this.help({ error: true });
			subCommand._prepareForParse();
			let promiseChain;
			promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
			promiseChain = this._chainOrCall(promiseChain, () => {
				if (subCommand._executableHandler) this._executeSubCommand(subCommand, operands.concat(unknown));
				else return subCommand._parseCommand(operands, unknown);
			});
			return promiseChain;
		}
		/**
		* Invoke help directly if possible, or dispatch if necessary.
		* e.g. help foo
		*
		* @private
		*/
		_dispatchHelpCommand(subcommandName) {
			if (!subcommandName) this.help();
			const subCommand = this._findCommand(subcommandName);
			if (subCommand && !subCommand._executableHandler) subCommand.help();
			return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
		}
		/**
		* Check this.args against expected this.registeredArguments.
		*
		* @private
		*/
		_checkNumberOfArguments() {
			this.registeredArguments.forEach((arg, i) => {
				if (arg.required && this.args[i] == null) this.missingArgument(arg.name());
			});
			if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) return;
			if (this.args.length > this.registeredArguments.length) this._excessArguments(this.args);
		}
		/**
		* Process this.args using this.registeredArguments and save as this.processedArgs!
		*
		* @private
		*/
		_processArguments() {
			const myParseArg = (argument, value, previous) => {
				let parsedValue = value;
				if (value !== null && argument.parseArg) {
					const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
					parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
				}
				return parsedValue;
			};
			this._checkNumberOfArguments();
			const processedArgs = [];
			this.registeredArguments.forEach((declaredArg, index) => {
				let value = declaredArg.defaultValue;
				if (declaredArg.variadic) {
					if (index < this.args.length) {
						value = this.args.slice(index);
						if (declaredArg.parseArg) value = value.reduce((processed, v) => {
							return myParseArg(declaredArg, v, processed);
						}, declaredArg.defaultValue);
					} else if (value === void 0) value = [];
				} else if (index < this.args.length) {
					value = this.args[index];
					if (declaredArg.parseArg) value = myParseArg(declaredArg, value, declaredArg.defaultValue);
				}
				processedArgs[index] = value;
			});
			this.processedArgs = processedArgs;
		}
		/**
		* Once we have a promise we chain, but call synchronously until then.
		*
		* @param {(Promise|undefined)} promise
		* @param {Function} fn
		* @return {(Promise|undefined)}
		* @private
		*/
		_chainOrCall(promise, fn) {
			if (promise?.then && typeof promise.then === "function") return promise.then(() => fn());
			return fn();
		}
		/**
		*
		* @param {(Promise|undefined)} promise
		* @param {string} event
		* @return {(Promise|undefined)}
		* @private
		*/
		_chainOrCallHooks(promise, event) {
			let result = promise;
			const hooks = [];
			this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
				hookedCommand._lifeCycleHooks[event].forEach((callback) => {
					hooks.push({
						hookedCommand,
						callback
					});
				});
			});
			if (event === "postAction") hooks.reverse();
			hooks.forEach((hookDetail) => {
				result = this._chainOrCall(result, () => {
					return hookDetail.callback(hookDetail.hookedCommand, this);
				});
			});
			return result;
		}
		/**
		*
		* @param {(Promise|undefined)} promise
		* @param {Command} subCommand
		* @param {string} event
		* @return {(Promise|undefined)}
		* @private
		*/
		_chainOrCallSubCommandHook(promise, subCommand, event) {
			let result = promise;
			if (this._lifeCycleHooks[event] !== void 0) this._lifeCycleHooks[event].forEach((hook) => {
				result = this._chainOrCall(result, () => {
					return hook(this, subCommand);
				});
			});
			return result;
		}
		/**
		* Process arguments in context of this command.
		* Returns action result, in case it is a promise.
		*
		* @private
		*/
		_parseCommand(operands, unknown) {
			const parsed = this.parseOptions(unknown);
			this._parseOptionsEnv();
			this._parseOptionsImplied();
			operands = operands.concat(parsed.operands);
			unknown = parsed.unknown;
			this.args = operands.concat(unknown);
			if (operands && this._findCommand(operands[0])) return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
			if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) return this._dispatchHelpCommand(operands[1]);
			if (this._defaultCommandName) {
				this._outputHelpIfRequested(unknown);
				return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
			}
			if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) this.help({ error: true });
			this._outputHelpIfRequested(parsed.unknown);
			this._checkForMissingMandatoryOptions();
			this._checkForConflictingOptions();
			const checkForUnknownOptions = () => {
				if (parsed.unknown.length > 0) this.unknownOption(parsed.unknown[0]);
			};
			const commandEvent = `command:${this.name()}`;
			if (this._actionHandler) {
				checkForUnknownOptions();
				this._processArguments();
				let promiseChain;
				promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
				promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
				if (this.parent) promiseChain = this._chainOrCall(promiseChain, () => {
					this.parent.emit(commandEvent, operands, unknown);
				});
				promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
				return promiseChain;
			}
			if (this.parent?.listenerCount(commandEvent)) {
				checkForUnknownOptions();
				this._processArguments();
				this.parent.emit(commandEvent, operands, unknown);
			} else if (operands.length) {
				if (this._findCommand("*")) return this._dispatchSubcommand("*", operands, unknown);
				if (this.listenerCount("command:*")) this.emit("command:*", operands, unknown);
				else if (this.commands.length) this.unknownCommand();
				else {
					checkForUnknownOptions();
					this._processArguments();
				}
			} else if (this.commands.length) {
				checkForUnknownOptions();
				this.help({ error: true });
			} else {
				checkForUnknownOptions();
				this._processArguments();
			}
		}
		/**
		* Find matching command.
		*
		* @private
		* @return {Command | undefined}
		*/
		_findCommand(name) {
			if (!name) return void 0;
			return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
		}
		/**
		* Return an option matching `arg` if any.
		*
		* @param {string} arg
		* @return {Option}
		* @package
		*/
		_findOption(arg) {
			return this.options.find((option) => option.is(arg));
		}
		/**
		* Display an error message if a mandatory option does not have a value.
		* Called after checking for help flags in leaf subcommand.
		*
		* @private
		*/
		_checkForMissingMandatoryOptions() {
			this._getCommandAndAncestors().forEach((cmd) => {
				cmd.options.forEach((anOption) => {
					if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) cmd.missingMandatoryOptionValue(anOption);
				});
			});
		}
		/**
		* Display an error message if conflicting options are used together in this.
		*
		* @private
		*/
		_checkForConflictingLocalOptions() {
			const definedNonDefaultOptions = this.options.filter((option) => {
				const optionKey = option.attributeName();
				if (this.getOptionValue(optionKey) === void 0) return false;
				return this.getOptionValueSource(optionKey) !== "default";
			});
			definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0).forEach((option) => {
				const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
				if (conflictingAndDefined) this._conflictingOption(option, conflictingAndDefined);
			});
		}
		/**
		* Display an error message if conflicting options are used together.
		* Called after checking for help flags in leaf subcommand.
		*
		* @private
		*/
		_checkForConflictingOptions() {
			this._getCommandAndAncestors().forEach((cmd) => {
				cmd._checkForConflictingLocalOptions();
			});
		}
		/**
		* Parse options from `argv` removing known options,
		* and return argv split into operands and unknown arguments.
		*
		* Side effects: modifies command by storing options. Does not reset state if called again.
		*
		* Examples:
		*
		*     argv => operands, unknown
		*     --known kkk op => [op], []
		*     op --known kkk => [op], []
		*     sub --unknown uuu op => [sub], [--unknown uuu op]
		*     sub -- --unknown uuu op => [sub --unknown uuu op], []
		*
		* @param {string[]} args
		* @return {{operands: string[], unknown: string[]}}
		*/
		parseOptions(args) {
			const operands = [];
			const unknown = [];
			let dest = operands;
			function maybeOption(arg) {
				return arg.length > 1 && arg[0] === "-";
			}
			const negativeNumberArg = (arg) => {
				if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
				return !this._getCommandAndAncestors().some((cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short)));
			};
			let activeVariadicOption = null;
			let activeGroup = null;
			let i = 0;
			while (i < args.length || activeGroup) {
				const arg = activeGroup ?? args[i++];
				activeGroup = null;
				if (arg === "--") {
					if (dest === unknown) dest.push(arg);
					dest.push(...args.slice(i));
					break;
				}
				if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
					this.emit(`option:${activeVariadicOption.name()}`, arg);
					continue;
				}
				activeVariadicOption = null;
				if (maybeOption(arg)) {
					const option = this._findOption(arg);
					if (option) {
						if (option.required) {
							const value = args[i++];
							if (value === void 0) this.optionMissingArgument(option);
							this.emit(`option:${option.name()}`, value);
						} else if (option.optional) {
							let value = null;
							if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) value = args[i++];
							this.emit(`option:${option.name()}`, value);
						} else this.emit(`option:${option.name()}`);
						activeVariadicOption = option.variadic ? option : null;
						continue;
					}
				}
				if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
					const option = this._findOption(`-${arg[1]}`);
					if (option) {
						if (option.required || option.optional && this._combineFlagAndOptionalValue) this.emit(`option:${option.name()}`, arg.slice(2));
						else {
							this.emit(`option:${option.name()}`);
							activeGroup = `-${arg.slice(2)}`;
						}
						continue;
					}
				}
				if (/^--[^=]+=/.test(arg)) {
					const index = arg.indexOf("=");
					const option = this._findOption(arg.slice(0, index));
					if (option && (option.required || option.optional)) {
						this.emit(`option:${option.name()}`, arg.slice(index + 1));
						continue;
					}
				}
				if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) dest = unknown;
				if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
					if (this._findCommand(arg)) {
						operands.push(arg);
						unknown.push(...args.slice(i));
						break;
					} else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
						operands.push(arg, ...args.slice(i));
						break;
					} else if (this._defaultCommandName) {
						unknown.push(arg, ...args.slice(i));
						break;
					}
				}
				if (this._passThroughOptions) {
					dest.push(arg, ...args.slice(i));
					break;
				}
				dest.push(arg);
			}
			return {
				operands,
				unknown
			};
		}
		/**
		* Return an object containing local option values as key-value pairs.
		*
		* @return {object}
		*/
		opts() {
			if (this._storeOptionsAsProperties) {
				const result = {};
				const len = this.options.length;
				for (let i = 0; i < len; i++) {
					const key = this.options[i].attributeName();
					result[key] = key === this._versionOptionName ? this._version : this[key];
				}
				return result;
			}
			return this._optionValues;
		}
		/**
		* Return an object containing merged local and global option values as key-value pairs.
		*
		* @return {object}
		*/
		optsWithGlobals() {
			return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
		}
		/**
		* Display error message and exit (or call exitOverride).
		*
		* @param {string} message
		* @param {object} [errorOptions]
		* @param {string} [errorOptions.code] - an id string representing the error
		* @param {number} [errorOptions.exitCode] - used with process.exit
		*/
		error(message, errorOptions) {
			this._outputConfiguration.outputError(`${message}\n`, this._outputConfiguration.writeErr);
			if (typeof this._showHelpAfterError === "string") this._outputConfiguration.writeErr(`${this._showHelpAfterError}\n`);
			else if (this._showHelpAfterError) {
				this._outputConfiguration.writeErr("\n");
				this.outputHelp({ error: true });
			}
			const config = errorOptions || {};
			const exitCode = config.exitCode || 1;
			const code = config.code || "commander.error";
			this._exit(exitCode, code, message);
		}
		/**
		* Apply any option related environment variables, if option does
		* not have a value from cli or client code.
		*
		* @private
		*/
		_parseOptionsEnv() {
			this.options.forEach((option) => {
				if (option.envVar && option.envVar in process$1.env) {
					const optionKey = option.attributeName();
					if (this.getOptionValue(optionKey) === void 0 || [
						"default",
						"config",
						"env"
					].includes(this.getOptionValueSource(optionKey))) {
						if (option.required || option.optional) this.emit(`optionEnv:${option.name()}`, process$1.env[option.envVar]);
						else this.emit(`optionEnv:${option.name()}`);
					}
				}
			});
		}
		/**
		* Apply any implied option values, if option is undefined or default value.
		*
		* @private
		*/
		_parseOptionsImplied() {
			const dualHelper = new DualOptions(this.options);
			const hasCustomOptionValue = (optionKey) => {
				return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
			};
			this.options.filter((option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
				Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
					this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
				});
			});
		}
		/**
		* Argument `name` is missing.
		*
		* @param {string} name
		* @private
		*/
		missingArgument(name) {
			const message = `error: missing required argument '${name}'`;
			this.error(message, { code: "commander.missingArgument" });
		}
		/**
		* `Option` is missing an argument.
		*
		* @param {Option} option
		* @private
		*/
		optionMissingArgument(option) {
			const message = `error: option '${option.flags}' argument missing`;
			this.error(message, { code: "commander.optionMissingArgument" });
		}
		/**
		* `Option` does not have a value, and is a mandatory option.
		*
		* @param {Option} option
		* @private
		*/
		missingMandatoryOptionValue(option) {
			const message = `error: required option '${option.flags}' not specified`;
			this.error(message, { code: "commander.missingMandatoryOptionValue" });
		}
		/**
		* `Option` conflicts with another option.
		*
		* @param {Option} option
		* @param {Option} conflictingOption
		* @private
		*/
		_conflictingOption(option, conflictingOption) {
			const findBestOptionFromValue = (option) => {
				const optionKey = option.attributeName();
				const optionValue = this.getOptionValue(optionKey);
				const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
				const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
				if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) return negativeOption;
				return positiveOption || option;
			};
			const getErrorMessage = (option) => {
				const bestOption = findBestOptionFromValue(option);
				const optionKey = bestOption.attributeName();
				if (this.getOptionValueSource(optionKey) === "env") return `environment variable '${bestOption.envVar}'`;
				return `option '${bestOption.flags}'`;
			};
			const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
			this.error(message, { code: "commander.conflictingOption" });
		}
		/**
		* Unknown option `flag`.
		*
		* @param {string} flag
		* @private
		*/
		unknownOption(flag) {
			if (this._allowUnknownOption) return;
			let suggestion = "";
			if (flag.startsWith("--") && this._showSuggestionAfterError) {
				let candidateFlags = [];
				let command = this;
				do {
					const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
					candidateFlags = candidateFlags.concat(moreFlags);
					command = command.parent;
				} while (command && !command._enablePositionalOptions);
				suggestion = suggestSimilar(flag, candidateFlags);
			}
			const message = `error: unknown option '${flag}'${suggestion}`;
			this.error(message, { code: "commander.unknownOption" });
		}
		/**
		* Excess arguments, more than expected.
		*
		* @param {string[]} receivedArgs
		* @private
		*/
		_excessArguments(receivedArgs) {
			if (this._allowExcessArguments) return;
			const expected = this.registeredArguments.length;
			const s = expected === 1 ? "" : "s";
			const message = `error: too many arguments${this.parent ? ` for '${this.name()}'` : ""}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
			this.error(message, { code: "commander.excessArguments" });
		}
		/**
		* Unknown command.
		*
		* @private
		*/
		unknownCommand() {
			const unknownName = this.args[0];
			let suggestion = "";
			if (this._showSuggestionAfterError) {
				const candidateNames = [];
				this.createHelp().visibleCommands(this).forEach((command) => {
					candidateNames.push(command.name());
					if (command.alias()) candidateNames.push(command.alias());
				});
				suggestion = suggestSimilar(unknownName, candidateNames);
			}
			const message = `error: unknown command '${unknownName}'${suggestion}`;
			this.error(message, { code: "commander.unknownCommand" });
		}
		/**
		* Get or set the program version.
		*
		* This method auto-registers the "-V, --version" option which will print the version number.
		*
		* You can optionally supply the flags and description to override the defaults.
		*
		* @param {string} [str]
		* @param {string} [flags]
		* @param {string} [description]
		* @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
		*/
		version(str, flags, description) {
			if (str === void 0) return this._version;
			this._version = str;
			flags = flags || "-V, --version";
			description = description || "output the version number";
			const versionOption = this.createOption(flags, description);
			this._versionOptionName = versionOption.attributeName();
			this._registerOption(versionOption);
			this.on("option:" + versionOption.name(), () => {
				this._outputConfiguration.writeOut(`${str}\n`);
				this._exit(0, "commander.version", str);
			});
			return this;
		}
		/**
		* Set the description.
		*
		* @param {string} [str]
		* @param {object} [argsDescription]
		* @return {(string|Command)}
		*/
		description(str, argsDescription) {
			if (str === void 0 && argsDescription === void 0) return this._description;
			this._description = str;
			if (argsDescription) this._argsDescription = argsDescription;
			return this;
		}
		/**
		* Set the summary. Used when listed as subcommand of parent.
		*
		* @param {string} [str]
		* @return {(string|Command)}
		*/
		summary(str) {
			if (str === void 0) return this._summary;
			this._summary = str;
			return this;
		}
		/**
		* Set an alias for the command.
		*
		* You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
		*
		* @param {string} [alias]
		* @return {(string|Command)}
		*/
		alias(alias) {
			if (alias === void 0) return this._aliases[0];
			/** @type {Command} */
			let command = this;
			if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) command = this.commands[this.commands.length - 1];
			if (alias === command._name) throw new Error("Command alias can't be the same as its name");
			const matchingCommand = this.parent?._findCommand(alias);
			if (matchingCommand) {
				const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
				throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
			}
			command._aliases.push(alias);
			return this;
		}
		/**
		* Set aliases for the command.
		*
		* Only the first alias is shown in the auto-generated help.
		*
		* @param {string[]} [aliases]
		* @return {(string[]|Command)}
		*/
		aliases(aliases) {
			if (aliases === void 0) return this._aliases;
			aliases.forEach((alias) => this.alias(alias));
			return this;
		}
		/**
		* Set / get the command usage `str`.
		*
		* @param {string} [str]
		* @return {(string|Command)}
		*/
		usage(str) {
			if (str === void 0) {
				if (this._usage) return this._usage;
				const args = this.registeredArguments.map((arg) => {
					return humanReadableArgName(arg);
				});
				return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
			}
			this._usage = str;
			return this;
		}
		/**
		* Get or set the name of the command.
		*
		* @param {string} [str]
		* @return {(string|Command)}
		*/
		name(str) {
			if (str === void 0) return this._name;
			this._name = str;
			return this;
		}
		/**
		* Set/get the help group heading for this subcommand in parent command's help.
		*
		* @param {string} [heading]
		* @return {Command | string}
		*/
		helpGroup(heading) {
			if (heading === void 0) return this._helpGroupHeading ?? "";
			this._helpGroupHeading = heading;
			return this;
		}
		/**
		* Set/get the default help group heading for subcommands added to this command.
		* (This does not override a group set directly on the subcommand using .helpGroup().)
		*
		* @example
		* program.commandsGroup('Development Commands:);
		* program.command('watch')...
		* program.command('lint')...
		* ...
		*
		* @param {string} [heading]
		* @returns {Command | string}
		*/
		commandsGroup(heading) {
			if (heading === void 0) return this._defaultCommandGroup ?? "";
			this._defaultCommandGroup = heading;
			return this;
		}
		/**
		* Set/get the default help group heading for options added to this command.
		* (This does not override a group set directly on the option using .helpGroup().)
		*
		* @example
		* program
		*   .optionsGroup('Development Options:')
		*   .option('-d, --debug', 'output extra debugging')
		*   .option('-p, --profile', 'output profiling information')
		*
		* @param {string} [heading]
		* @returns {Command | string}
		*/
		optionsGroup(heading) {
			if (heading === void 0) return this._defaultOptionGroup ?? "";
			this._defaultOptionGroup = heading;
			return this;
		}
		/**
		* @param {Option} option
		* @private
		*/
		_initOptionGroup(option) {
			if (this._defaultOptionGroup && !option.helpGroupHeading) option.helpGroup(this._defaultOptionGroup);
		}
		/**
		* @param {Command} cmd
		* @private
		*/
		_initCommandGroup(cmd) {
			if (this._defaultCommandGroup && !cmd.helpGroup()) cmd.helpGroup(this._defaultCommandGroup);
		}
		/**
		* Set the name of the command from script filename, such as process.argv[1],
		* or require.main.filename, or __filename.
		*
		* (Used internally and public although not documented in README.)
		*
		* @example
		* program.nameFromFilename(require.main.filename);
		*
		* @param {string} filename
		* @return {Command}
		*/
		nameFromFilename(filename) {
			this._name = path.basename(filename, path.extname(filename));
			return this;
		}
		/**
		* Get or set the directory for searching for executable subcommands of this command.
		*
		* @example
		* program.executableDir(__dirname);
		* // or
		* program.executableDir('subcommands');
		*
		* @param {string} [path]
		* @return {(string|null|Command)}
		*/
		executableDir(path) {
			if (path === void 0) return this._executableDir;
			this._executableDir = path;
			return this;
		}
		/**
		* Return program help documentation.
		*
		* @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
		* @return {string}
		*/
		helpInformation(contextOptions) {
			const helper = this.createHelp();
			const context = this._getOutputContext(contextOptions);
			helper.prepareContext({
				error: context.error,
				helpWidth: context.helpWidth,
				outputHasColors: context.hasColors
			});
			const text = helper.formatHelp(this, helper);
			if (context.hasColors) return text;
			return this._outputConfiguration.stripColor(text);
		}
		/**
		* @typedef HelpContext
		* @type {object}
		* @property {boolean} error
		* @property {number} helpWidth
		* @property {boolean} hasColors
		* @property {function} write - includes stripColor if needed
		*
		* @returns {HelpContext}
		* @private
		*/
		_getOutputContext(contextOptions) {
			contextOptions = contextOptions || {};
			const error = !!contextOptions.error;
			let baseWrite;
			let hasColors;
			let helpWidth;
			if (error) {
				baseWrite = (str) => this._outputConfiguration.writeErr(str);
				hasColors = this._outputConfiguration.getErrHasColors();
				helpWidth = this._outputConfiguration.getErrHelpWidth();
			} else {
				baseWrite = (str) => this._outputConfiguration.writeOut(str);
				hasColors = this._outputConfiguration.getOutHasColors();
				helpWidth = this._outputConfiguration.getOutHelpWidth();
			}
			const write = (str) => {
				if (!hasColors) str = this._outputConfiguration.stripColor(str);
				return baseWrite(str);
			};
			return {
				error,
				write,
				hasColors,
				helpWidth
			};
		}
		/**
		* Output help information for this command.
		*
		* Outputs built-in help, and custom text added using `.addHelpText()`.
		*
		* @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
		*/
		outputHelp(contextOptions) {
			let deprecatedCallback;
			if (typeof contextOptions === "function") {
				deprecatedCallback = contextOptions;
				contextOptions = void 0;
			}
			const outputContext = this._getOutputContext(contextOptions);
			/** @type {HelpTextEventContext} */
			const eventContext = {
				error: outputContext.error,
				write: outputContext.write,
				command: this
			};
			this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
			this.emit("beforeHelp", eventContext);
			let helpInformation = this.helpInformation({ error: outputContext.error });
			if (deprecatedCallback) {
				helpInformation = deprecatedCallback(helpInformation);
				if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) throw new Error("outputHelp callback must return a string or a Buffer");
			}
			outputContext.write(helpInformation);
			if (this._getHelpOption()?.long) this.emit(this._getHelpOption().long);
			this.emit("afterHelp", eventContext);
			this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", eventContext));
		}
		/**
		* You can pass in flags and a description to customise the built-in help option.
		* Pass in false to disable the built-in help option.
		*
		* @example
		* program.helpOption('-?, --help' 'show help'); // customise
		* program.helpOption(false); // disable
		*
		* @param {(string | boolean)} flags
		* @param {string} [description]
		* @return {Command} `this` command for chaining
		*/
		helpOption(flags, description) {
			if (typeof flags === "boolean") {
				if (flags) {
					if (this._helpOption === null) this._helpOption = void 0;
					if (this._defaultOptionGroup) this._initOptionGroup(this._getHelpOption());
				} else this._helpOption = null;
				return this;
			}
			this._helpOption = this.createOption(flags ?? "-h, --help", description ?? "display help for command");
			if (flags || description) this._initOptionGroup(this._helpOption);
			return this;
		}
		/**
		* Lazy create help option.
		* Returns null if has been disabled with .helpOption(false).
		*
		* @returns {(Option | null)} the help option
		* @package
		*/
		_getHelpOption() {
			if (this._helpOption === void 0) this.helpOption(void 0, void 0);
			return this._helpOption;
		}
		/**
		* Supply your own option to use for the built-in help option.
		* This is an alternative to using helpOption() to customise the flags and description etc.
		*
		* @param {Option} option
		* @return {Command} `this` command for chaining
		*/
		addHelpOption(option) {
			this._helpOption = option;
			this._initOptionGroup(option);
			return this;
		}
		/**
		* Output help information and exit.
		*
		* Outputs built-in help, and custom text added using `.addHelpText()`.
		*
		* @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
		*/
		help(contextOptions) {
			this.outputHelp(contextOptions);
			let exitCode = Number(process$1.exitCode ?? 0);
			if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) exitCode = 1;
			this._exit(exitCode, "commander.help", "(outputHelp)");
		}
		/**
		* // Do a little typing to coordinate emit and listener for the help text events.
		* @typedef HelpTextEventContext
		* @type {object}
		* @property {boolean} error
		* @property {Command} command
		* @property {function} write
		*/
		/**
		* Add additional text to be displayed with the built-in help.
		*
		* Position is 'before' or 'after' to affect just this command,
		* and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
		*
		* @param {string} position - before or after built-in help
		* @param {(string | Function)} text - string to add, or a function returning a string
		* @return {Command} `this` command for chaining
		*/
		addHelpText(position, text) {
			const allowedValues = [
				"beforeAll",
				"before",
				"after",
				"afterAll"
			];
			if (!allowedValues.includes(position)) throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
			const helpEvent = `${position}Help`;
			this.on(helpEvent, (context) => {
				let helpStr;
				if (typeof text === "function") helpStr = text({
					error: context.error,
					command: context.command
				});
				else helpStr = text;
				if (helpStr) context.write(`${helpStr}\n`);
			});
			return this;
		}
		/**
		* Output help information if help flags specified
		*
		* @param {Array} args - array of options to search for help flags
		* @private
		*/
		_outputHelpIfRequested(args) {
			const helpOption = this._getHelpOption();
			if (helpOption && args.find((arg) => helpOption.is(arg))) {
				this.outputHelp();
				this._exit(0, "commander.helpDisplayed", "(outputHelp)");
			}
		}
	};
	/**
	* Scan arguments and increment port number for inspect calls (to avoid conflicts when spawning new command).
	*
	* @param {string[]} args - array of arguments from node.execArgv
	* @returns {string[]}
	* @private
	*/
	function incrementNodeInspectorPort(args) {
		return args.map((arg) => {
			if (!arg.startsWith("--inspect")) return arg;
			let debugOption;
			let debugHost = "127.0.0.1";
			let debugPort = "9229";
			let match;
			if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) debugOption = match[1];
			else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
				debugOption = match[1];
				if (/^\d+$/.test(match[3])) debugPort = match[3];
				else debugHost = match[3];
			} else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
				debugOption = match[1];
				debugHost = match[3];
				debugPort = match[4];
			}
			if (debugOption && debugPort !== "0") return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
			return arg;
		});
	}
	/**
	* @returns {boolean | undefined}
	* @package
	*/
	function useColor() {
		if (process$1.env.NO_COLOR || process$1.env.FORCE_COLOR === "0" || process$1.env.FORCE_COLOR === "false") return false;
		if (process$1.env.FORCE_COLOR || process$1.env.CLICOLOR_FORCE !== void 0) return true;
	}
	exports.Command = Command;
	exports.useColor = useColor;
}));
const { program: program$1, createCommand, createArgument, createOption, CommanderError, InvalidArgumentError, InvalidOptionArgumentError, Command, Argument, Option, Help } = (/* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports) => {
	const { Argument } = require_argument();
	const { Command } = require_command();
	const { CommanderError, InvalidArgumentError } = require_error();
	const { Help } = require_help();
	const { Option } = require_option();
	exports.program = new Command();
	exports.createCommand = (name) => new Command(name);
	exports.createOption = (flags, description) => new Option(flags, description);
	exports.createArgument = (name, description) => new Argument(name, description);
	/**
	* Expose classes
	*/
	exports.Command = Command;
	exports.Option = Option;
	exports.Argument = Argument;
	exports.Help = Help;
	exports.CommanderError = CommanderError;
	exports.InvalidArgumentError = InvalidArgumentError;
	exports.InvalidOptionArgumentError = InvalidArgumentError;
})))(), 1)).default;
//#endregion
//#region ../../node_modules/.pnpm/cyber-mux@0.5.0/node_modules/cyber-mux/dist/worktree-hHuFZkpW.mjs
const nodeExec = (cmd, args) => {
	try {
		const out = execFileSync(cmd, args, {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		}).trim();
		nodeExec.lastError = void 0;
		return out;
	} catch (err) {
		const stderr = err.stderr;
		nodeExec.lastError = String(stderr ?? "").trim() || void 0;
		return null;
	}
};
/**
* A failure message carrying the runner's reason for it, when there is one. The backend's own words
* verbatim — never a paraphrase, and never a guess: a refused split may be a region too small, or a
* server that is simply gone, and only the backend knows which.
*/
function withReason(exec, message) {
	return exec.lastError ? `${message} — ${exec.lastError}` : message;
}
const nodeWorktreeFs = {
	exists: existsSync,
	realpath: (path) => realpathSync.native(path)
};
/**
* This module's own refusals and failures — plain cyber-mux prose, never a dependency's raw words.
* `reportWorktreeFailure` (`cli.ts`) forwards a `WorktreeGitError`'s message onto stdout verbatim
* because it is safe to: everything thrown here is this CLI's own text. Anything else that reaches
* that catch-all (a `session.tmux.ts`/`session.herdr.ts` throw, which embeds the backend's own name
* and its raw stderr via `withReason`) is a different case and is translated, not forwarded.
*/
var WorktreeGitError = class extends Error {};
/** The only worktree backend at MVP — plain `git worktree`. */
const gitWorktreeAdapter = {
	add(exec, opts) {
		const args = [
			"-C",
			opts.primaryRoot,
			"worktree",
			"add",
			"-b",
			opts.branch,
			opts.path
		];
		if (opts.base) args.push(opts.base);
		if (exec("git", args) === null) throw new WorktreeGitError(`git worktree add failed for ${opts.path}`);
		return {
			root: resolve(opts.path),
			branch: opts.branch
		};
	},
	remove(exec, path, opts) {
		if (exec("git", [
			"-C",
			opts.primaryRoot,
			"worktree",
			"remove",
			path,
			"--force"
		]) === null) throw new WorktreeGitError(`git worktree remove failed for ${path}`);
	}
};
/**
* Resolve the primary checkout's root regardless of whether the caller's cwd is the primary
* checkout or a linked worktree — `--git-common-dir` always points at the main repo's `.git`.
*/
function resolvePrimaryRoot(exec) {
	const commonDir = exec("git", [
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir"
	]);
	if (!commonDir) throw new WorktreeGitError("cannot resolve the primary checkout — not inside a git repository");
	return dirname(commonDir);
}
/**
* The single normalization point for every path that gets MATCHED against another — a multiplexer
* reports its own checkout paths, and those only line up with git's if both sides are resolved the
* same way (a symlinked repo, or macOS's `/tmp` → `/private/tmp`, otherwise silently fails to
* match). Falls back to `resolve` for a path that isn't on disk, where there is no link to follow.
*/
function normalizeWorktreePath(path, fs = nodeWorktreeFs) {
	try {
		return fs.realpath(path);
	} catch {
		return resolve(path);
	}
}
/**
* Refuse the primary checkout: a spawned session's resolved worktree root must never be the primary
* checkout itself.
*/
function assertDistinctFromPrimary(worktreeRoot, primaryRoot) {
	if (resolve(worktreeRoot) === resolve(primaryRoot)) throw new WorktreeGitError("refusing to run in the primary checkout — spawn a worktree distinct from the primary checkout");
}
//#endregion
//#region ../../node_modules/.pnpm/cyber-mux@0.5.0/node_modules/cyber-mux/dist/backend-DjX6RlAG.mjs
/**
* The env-prefix fallback — the one compensation for a route that could not set env at birth.
*
* env is native at every tier on both backends EXCEPT herdr's worktree `create`/`open`, which take
* no env parameter (0.7.4 answers `--env` with `unknown option`). A route that hit that wall carries
* env the only way left: as an `env KEY=VALUE` prefix on the command the pane runs. It is a LAST
* resort — the values land in `ps` output and the pane's shell history — and it only works when there
* IS a command to ride; with none, the honest outcome is to warn, never to drop silently.
*
* This lives in one module, called by both routes that can lose env (the CLI worktree verbs and the
* template walk's root pane), so the rule cannot be wired on one and forgotten on the other. Only a
* route that lost env may call it: prefixing over a natively-set env would push the values into `ps`
* and shell history on every route, the exact cost the prefix exists to pay only when it must.
*/
/**
* Single-quote a value for a shell command line. Everything is literal inside single quotes, so the
* only escape needed is for a single quote itself: end the quoting, emit an escaped `'`, reopen.
* Without this a value carrying a space or a quote would split into extra words, or unbalance the
* line outright.
*/
function shellQuote$1(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
/** `env K=V …` with a trailing space, ready to prepend to a command line. Values are shell-quoted. */
function envPrefix(env) {
	return `env ${Object.entries(env).map(([key, value]) => `${key}=${shellQuote$1(value)}`).join(" ")} `;
}
/**
* Given the env a route could not carry and the command (if any) that would run in the opened pane,
* decide how env rides in. With a command, env is prefixed onto it and the pane carries the value;
* with none, env is dropped and the caller warns. No env (or an empty map) is `carried` unchanged, so
* a caller on the losing route can call this unconditionally and get the right command back.
*/
function envFallback(env, command) {
	if (env === void 0 || Object.keys(env).length === 0) return {
		kind: "carried",
		command
	};
	if (command === void 0) return {
		kind: "dropped",
		variables: Object.keys(env)
	};
	return {
		kind: "carried",
		command: `${envPrefix(env)}${command}`
	};
}
/**
* The floating-pane refusal — the `'pane:float'` placement's answer on a backend that has no
* floating-pane concept (wezterm, herdr).
*
* Its own module rather than a member of `mux.ts` for the reason every other seam type is not a
* class: `mux.ts` is the CONTRACT and carries no runtime value, so putting the one class the
* contract's refusal needs there would make every consumer of the types import a value too. It is
* the core-surface parallel of `CaptureUnsupportedError` (`template-capture.ts`) and
* `AgentLifecycleUnsupportedError` (`agent.ts`), and it rides the `.` barrel rather than a subpath
* because the verb it refuses — `open` — is on the surface everybody gets.
*/
/**
* A floating pane asked of a backend that cannot open one (`open` with `at: 'pane:float'` on wezterm
* or herdr). A refusal, never a substitution: the nearest thing those backends could open is a tiled
* split, which takes a share of the region and resizes its other panes — exactly the property a float
* exists to avoid — so a caller would get back a pane whose id satisfies them and whose behavior does
* not. There is no truthful degrade, so there is no degrade.
*
* PORTABLE and exit-code-free by design, the exact mirror of `AgentLifecycleUnsupportedError`. The
* DECISION to refuse is the library's, made inside each adapter's `open` — the one place that sees
* both the backend and the requested placement. How the refusal SURFACES (the exit code, the fix
* hint, the exact sentence) is the CLI's, which catches this and re-raises its own
* `backend-unsupported` error. `backend` names the backend so a caller composes the message without
* re-deriving it; the terse `message` is a factual log line.
*/
var FloatingPanesUnsupportedError = class extends Error {
	backend;
	constructor(backend) {
		super(`${backend} cannot open a floating pane`);
		this.backend = backend;
		this.name = "FloatingPanesUnsupportedError";
	}
};
/**
* Refuse a `'pane:float'` open on the backend named — the single spelling of the refusal, called by
* every adapter that lacks the capability so the two cannot drift into two different messages.
*
* Takes the NAME rather than the adapter: it is called from inside `open`, where the adapter object is
* still being constructed on some backends, and the name is the only thing the error carries anyway.
*/
function refuseFloatingPane(backend) {
	throw new FloatingPanesUnsupportedError(backend);
}
/**
* The seam's own precondition on a wait pattern: EXACTLY ONE of `match`/`regex`, and a `regex` that
* compiles.
*
* Enforced here, at the seam, rather than per adapter, for `assertRatioInRange`'s reason — it is a
* universal property of what a wait pattern IS, true on every backend, not a per-backend policy. Both
* halves matter for portability in different ways: the one-of rule is refusable by herdr's CLI and by
* nothing at all on a polling backend, so leaving it to the backend would make the same call fail on
* one and silently pick a winner on another; and compiling the source turns a MALFORMED pattern into
* the same loud failure everywhere, instead of a herdr refusal on one backend and a poll that throws
* on its first read somewhere else.
*
* What it deliberately does NOT check is dialect: a pattern using ECMAScript-only syntax compiles here
* and is then herdr's own to accept or refuse (see `MuxWaitOptions.regex`). Validating against the
* intersection of two regex engines would mean shipping a third one.
*/
function assertWaitPattern(opts) {
	const hasMatch = opts.match != null;
	const hasRegex = opts.regex != null;
	if (hasMatch && hasRegex) throw new Error("wait pattern must be one of match or regex — got both");
	if (!hasMatch && !hasRegex) throw new Error("wait pattern must be one of match or regex — got neither");
	if (opts.match != null && opts.match === "") throw new Error("wait pattern match must not be empty");
	if (opts.regex != null) try {
		new RegExp(opts.regex);
	} catch (err) {
		throw new Error(`wait pattern regex is not a valid expression: ${opts.regex} — ${err.message}`);
	}
}
/**
* Whether `output` satisfies the pattern, and the single line to point at when it does.
*
* The match runs against the WHOLE snapshot, not line by line, so a regex that spans a newline still
* hits — that is why `matchedLine` is derived separately and left absent when no single line carries
* the match on its own. Pure, so the tricky half is testable with no multiplexer at all, exactly as
* `template-capture`'s geometry derivation is.
*/
function matchWaitPattern(output, opts) {
	assertWaitPattern(opts);
	const hit = (text) => opts.match != null ? text.includes(opts.match) : new RegExp(opts.regex).test(text);
	if (!hit(output)) return {
		matched: false,
		output
	};
	const line = output.split("\n").find(hit);
	return {
		matched: true,
		output,
		...line != null ? { matchedLine: line } : {}
	};
}
/**
* `waitForOutput` for a backend with NO native wait — poll its own `read` until the pattern matches or
* the deadline passes. tmux, WezTerm and Zellij all route their seam method straight through here, so
* the three share one cadence, one deadline rule and one liveness rule rather than three copies that
* can drift; herdr overrides it with its native primitive.
*
* **Reads first, sleeps second.** The snapshot on screen when the call arrives is searched before any
* sleeping, so a pattern already printed returns immediately — the seam's stated "existing output
* counts" rule, and the same order herdr's native wait documents for itself.
*
* **A gone pane throws instead of timing out**, which is `nudge`'s rule for the same reason: a dead
* pane and a quiet one both read back empty, so without the liveness probe every dead peer would be
* reported as a timeout — a shape the caller reads as "still working" — and the real cause would be
* buried. Probed BEFORE the first read (so a pane that was already gone fails at once rather than
* after the full timeout) and again after the deadline (so a pane that died mid-wait is not reported as
* one that merely stayed quiet). Never probed per poll: that would double every backend's query load
* for a fact that only changes the verdict at the end.
*/
async function pollForOutput(adapter, exec, target, opts) {
	assertWaitPattern(opts);
	const pollMs = opts.pollMs ?? 150;
	const now = opts.now ?? (() => Date.now());
	const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	const readOpts = opts.lines != null ? { lines: opts.lines } : void 0;
	assertPaneLive(adapter, exec, target);
	const deadline = now() + opts.timeoutMs;
	let output = "";
	for (;;) {
		output = adapter.read(exec, target, readOpts).text;
		const result = matchWaitPattern(output, opts);
		if (result.matched) return result;
		if (now() >= deadline) break;
		await sleep(pollMs);
	}
	assertPaneLive(adapter, exec, target);
	return {
		matched: false,
		output
	};
}
/** The liveness probe both ends of a poll share, throwing `nudge`'s named failure rather than letting a
* dead pane be reported as a quiet one. */
function assertPaneLive(adapter, exec, target) {
	if (!adapter.paneExists(exec, target)) throw new Error(`wait failed: pane ${target.id} no longer exists — the pane is gone, not quiet.`);
}
/**
* The seam's own precondition on `MuxOpenOptions.ratio`: a fraction STRICTLY between 0 and 1.
*
* `ratio` is the fraction kept by the ORIGINAL pane. Outside `0 < ratio < 1` there is no split it can
* name: `1 - ratio` goes negative above 1 (tmux `-l -50%` / wezterm `--percent -50`), and 0 or 1 hands
* one side the whole region and the other nothing — a mistake, never an intent worth honoring. Left
* unrendered these produce a silently broken split, not an error, which is the exact silent-wrong
* output this seam's loud-over-quiet preference exists to refuse.
*
* Enforced HERE, at the seam, rather than left to each caller, because the invariant is a universal
* property of what a ratio IS — true on every backend — not a per-caller policy. (The DEGRADE policy —
* what a caller does when a backend cannot size a split at all — genuinely stays the caller's, unchanged;
* range validity and degrade policy are different questions.) A caller cannot reach an adapter with an
* out-of-range ratio and have it silently rendered; `template`'s schema still refuses one earlier, per
* node, with a path-qualified message, so the two layers do different jobs and the seam is the backstop.
*
* The guard lives WITH the rendering: it is called by each backend's size render helper, so a backend
* that cannot size a split (zellij) renders no ratio and so never reaches this guard — a dropped value
* is never checked, valid or not, which is the same as the even-default degrade its callers already take.
*/
function assertRatioInRange(ratio) {
	if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) throw new Error(`ratio must be strictly between 0 and 1 — got ${ratio}`);
}
/**
* The READ WINDOW: how much of a pane a capture asks for, and whether rows sat above what came back.
*
* Both halves live here because they are one question. A capture is bounded — by the caller's `lines`,
* or by the backend's own default (the viewport on all four) — and "was anything dropped" is a
* property of that bound. Unbind the window (`lines: 'all'`) and the answer is `false` by
* construction, with no probe to spend.
*
* The truncation rule itself is shared by every adapter so the four backends answer
* `MuxReadResult.truncated` by one definition rather than four that can drift — the same reason
* `pollForOutput` owns one poll cadence for the three polling backends.
*
* Pure, and deliberately so: the tricky half of the answer is a row count, testable with no
* multiplexer at all (`template-capture`'s geometry derivation is the precedent). Each adapter owns
* only the one thing that genuinely differs — how its backend spells "one row deeper".
*/
/**
* How many terminal ROWS a capture carries.
*
* A trailing newline is a terminator, not an empty row: `capture-pane` and `dump-screen` both end
* their output with one, so counting it would make every capture look one row longer than the screen
* and — worse — would compare unequal against a probe that happened not to end with one. An empty
* capture is zero rows, not one.
*/
function capturedRows(text) {
	if (text === "") return 0;
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n").length;
}
/**
* Whether `capture` omitted older rows, judged against `deeper` — the SAME read taken one row further
* back.
*
* More rows in the deeper read means there was output above the captured window that the caller did
* not receive. An equal (or smaller) count means the deeper read had nothing more to give: the
* backend clamped at the top of what it holds, so the caller has everything there is.
*
* Row counts, not text equality, because the two reads are not required to render the shared rows
* identically — herdr's deeper probe reads a different `--source`, and a backend may re-wrap. What
* both reads DO agree on is how many rows they returned, and that is the whole question.
*/
function isReadTruncated(capture, deeper) {
	return capturedRows(deeper) > capturedRows(capture);
}
/**
* The row count that stands in for "the whole scrollback" on a backend whose read takes a NUMBER and
* has no all-history token of its own (WezTerm's `--start-line`, herdr's `--lines`) — tmux (`-S -`)
* and Zellij (`--full`) say it exactly and never reach for this.
*
* A million rows is past any real pane's history (tmux's own `history-limit` defaults to 2000) and
* both backends CLAMP an over-deep window to what they hold rather than failing, so this reads as
* "everything" without pretending to be a precise number. It stays under a u32, which is what herdr's
* CLI parses `--lines` as.
*/
const FULL_SCROLLBACK_LINES = 1e6;
/**
* herdr backend — detected via `$HERDR_ENV`. herdr (https://herdr.dev) is an agent-aware terminal
* multiplexer that also reports real busy-state (working / idle / blocked / done); this adapter
* only drives its pane lifecycle, not the state feed. Talks to herdr's own CLI (`herdr pane ...`)
* rather than its Unix-socket API, so it composes with this codebase's synchronous `Exec`
* convention exactly like the tmux adapter — no new client/transport needed.
*
* The pane lifecycle (split/run/read/close) is verified against a live herdr binary; `pane split`
* returns a JSON `pane_info` envelope whose id is extracted in `parsePaneId`.
*
* **Verified against 0.8.0** (protocol 19), re-probed against a live server. Everything this adapter
* drives held: the split/read/run/send-keys lifecycle, `pane wait-output`'s success and error
* envelopes, `pane list`/`get`/`layout`, `workspace create`/`tab create`, and the `env` and worktree
* parameter sets below. The per-claim markers that follow name the version each was LAST established
* against — a claim still reading 0.7.4/0.7.5 is one 0.8.0 gave no occasion to re-measure (no attached
* client, or no live agent in the pane), not one that failed.
*/
const herdrMuxAdapter = {
	name: "herdr",
	canSizeSplits: true,
	open(exec, opts) {
		const at = opts.at ?? "tab";
		const label = opts.label ? ["--label", opts.label] : [];
		const env = envFlags(opts.env);
		let opened;
		if (at === "workspace") {
			const out = exec("herdr", [
				"workspace",
				"create",
				"--cwd",
				opts.cwd,
				...label,
				...env,
				"--no-focus"
			]);
			if (!out) throw new Error(withReason(exec, "herdr workspace create failed"));
			opened = parseRootPaneId(out, "herdr workspace create");
		} else if (at === "tab") {
			const out = exec("herdr", [
				"tab",
				"create",
				...opts.within ? ["--workspace", opts.within] : [],
				"--cwd",
				opts.cwd,
				...label,
				...env,
				"--no-focus"
			]);
			if (!out) throw new Error(withReason(exec, "herdr tab create failed"));
			opened = parseRootPaneId(out, "herdr tab create");
		} else if (at === "pane:float") refuseFloatingPane(herdrMuxAdapter.name);
		else {
			const direction = at === "pane:down" ? "down" : "right";
			const from = opts.from ? [opts.from.id] : ["--current"];
			const size = opts.ratio != null ? ["--ratio", toHerdrRatio(opts.ratio)] : [];
			const out = exec("herdr", [
				"pane",
				"split",
				...from,
				"--direction",
				direction,
				"--cwd",
				opts.cwd,
				...size,
				...env
			]);
			if (!out) throw new Error(withReason(exec, "herdr pane split failed"));
			opened = parsePaneId(out);
			if (opts.label) herdrMuxAdapter.rename(exec, opened, "pane", opts.label);
		}
		if (opts.launch) herdrMuxAdapter.submit(exec, opened, opts.launch);
		return opened;
	},
	rename(exec, target, tier, name) {
		exec("herdr", [
			tier,
			"rename",
			target.id,
			name
		]);
	},
	group() {},
	worktree: herdrWorktreeCapability(),
	sendText(exec, target, text) {
		exec("herdr", [
			"pane",
			"send-text",
			target.id,
			text
		]);
	},
	sendKeys(exec, target, keys) {
		exec("herdr", [
			"pane",
			"send-keys",
			target.id,
			...keys
		]);
	},
	submit(exec, target, text) {
		if (!text) {
			exec("herdr", [
				"pane",
				"send-keys",
				target.id,
				"Enter"
			]);
			return;
		}
		exec("herdr", [
			"pane",
			"run",
			target.id,
			text
		]);
	},
	/**
	* 0.8.0 added a `truncated` boolean to the read result, and it is REQUIRED in the socket schema's
	* `PaneReadResult` — but it is not reachable from here, and that is a fact about the CLI rather than
	* a choice: `herdr pane read` prints the pane's bare TEXT, no envelope, and its only 0.8.0 additions
	* are `--format`/`--ansi`/`--raw`, which select the text's escaping. There is no `--json`. So the
	* flag rides the socket API this adapter deliberately does not speak, and the one CLI surface that
	* does hand back the envelope is `pane wait-output` (`.result.read.truncated` — seen live on 0.8.0).
	* Surfacing truncation therefore costs a return-shape change, not a flag; see issue #100, which owns
	* it across all four backends. Noted here so the next reader does not re-derive the dead end.
	*/
	read(exec, target, opts) {
		if (opts?.lines === "all") {
			const text = paneRead(exec, target, "recent", FULL_SCROLLBACK_LINES);
			return opts.truncation ? {
				text,
				truncated: false
			} : { text };
		}
		const text = paneRead(exec, target, "visible", opts?.lines);
		if (!opts?.truncation) return { text };
		return {
			text,
			truncated: isReadTruncated(text, paneRead(exec, target, "recent", capturedRows(text) + 1))
		};
	},
	/**
	* The one backend with a NATIVE wait: `pane wait-output` blocks in herdr itself (arrived in 0.7.5,
	* still native in 0.8.0), so no poll loop is run here and no snapshot is pulled across the CLI
	* boundary on every tick.
	*
	* `--source visible` is pinned rather than left to herdr's own default (`recent_unwrapped`, verified
	* against 0.7.5 — the help still says `recent` in 0.8.0). The seam's rule is that a wait searches exactly what
	* `read` returns, and `read` pins `visible` here; taking the default would make the same wait mean a
	* different snapshot on this backend than on every polling one.
	*
	* Telling a TIMEOUT (an answer) from a broken wait (a failure) is the whole difficulty, because herdr
	* spells both the same way: exit 1 with an error envelope on stderr, so `Exec` yields `null` for
	* either. Two tiers answer it, in order:
	*
	* 1. **The envelope's `code`**, when the runner captured stderr into `lastError` (re-verified against
	*    0.8.0: `{"error":{"code":"timeout",…}}` vs `{"error":{"code":"pane_not_found",…}}`). Exact.
	* 2. **A live pane that actually consumed the deadline**, when it did not. `Exec.lastError` is
	*    specified as a diagnostic and NEVER a control-flow signal — a runner that discards stderr must
	*    still work — so the code cannot be the only answer. Liveness alone is not enough either, and the
	*    reason is a whole released version of the backend: herdr 0.7.4 has no `pane wait-output` at all,
	*    so it answers with clap's usage text (not an envelope) INSTANTLY, and a liveness-only rule reads
	*    that as "timed out" — a silently wrong answer for a wait that never ran. Elapsed time is the fact
	*    that separates them and needs no stderr: a wait that returns in a fraction of its own timeout did
	*    not wait. Both must hold — the pane is live AND the deadline was spent — or this throws.
	*
	* A timeout costs ONE extra `read`, because herdr's timeout envelope carries no snapshot and the seam
	* promises the caller the evidence its verdict was reached on. It is taken at the deadline, so it is
	* the same "last look at the pane" a polling backend returns, one poll interval later.
	*/
	async waitForOutput(exec, target, opts) {
		assertWaitPattern(opts);
		const now = opts.now ?? (() => Date.now());
		const pattern = opts.match != null ? ["--match", opts.match] : ["--regex", opts.regex];
		const args = [
			"pane",
			"wait-output",
			target.id,
			"--source",
			"visible",
			"--timeout",
			String(opts.timeoutMs)
		];
		args.push(...pattern);
		if (opts.lines != null) args.push("--lines", String(opts.lines));
		const started = now();
		const out = exec("herdr", args);
		if (out == null) {
			if (!isHerdrWaitTimeout(exec, target, opts.timeoutMs, now() - started)) throw new Error(withReason(exec, `herdr pane wait-output failed for pane ${target.id}`));
			const readOpts = opts.lines != null ? { lines: opts.lines } : void 0;
			return {
				matched: false,
				output: herdrMuxAdapter.read(exec, target, readOpts).text
			};
		}
		return parseWaitOutput(out);
	},
	focus(exec, target) {
		const { workspaceId, tabId } = parsePaneLocation$1(exec("herdr", [
			"pane",
			"get",
			target.id
		]), target.id);
		exec("herdr", [
			"workspace",
			"focus",
			workspaceId
		]);
		exec("herdr", [
			"tab",
			"focus",
			tabId
		]);
	},
	teardown(exec, target) {
		exec("herdr", [
			"pane",
			"close",
			target.id
		]);
	},
	paneExists(exec, target) {
		return exec("herdr", [
			"pane",
			"read",
			target.id,
			"--source",
			"visible"
		]) !== null;
	},
	isPaneFocused(exec, target) {
		const out = exec("herdr", [
			"pane",
			"get",
			target.id
		]);
		if (out == null) return void 0;
		try {
			const focused = JSON.parse(out)?.result?.pane?.focused;
			return typeof focused === "boolean" ? focused : void 0;
		} catch {
			return;
		}
	},
	listPanes(exec) {
		const out = exec("herdr", ["pane", "list"]);
		if (!out) return [];
		let panes;
		try {
			panes = JSON.parse(out)?.result?.panes;
		} catch {
			return [];
		}
		if (!Array.isArray(panes)) return [];
		return panes.filter((p) => typeof p?.pane_id === "string").map((p) => {
			const harness = p.agent || void 0;
			const label = p.label || void 0;
			const agentStatus = toAgentStatus(p.agent_status);
			return {
				id: p.pane_id,
				mux: "herdr",
				floating: false,
				...harness !== void 0 ? { harness } : {},
				...agentStatus !== void 0 ? { agentStatus } : {},
				...p.cwd !== void 0 ? { cwd: p.cwd } : {},
				...label !== void 0 ? { label } : {}
			};
		});
	},
	regions: {
		describeRegion(exec, target) {
			return herdrRegionPanes(exec, target.id, herdrPaneDetails(exec));
		},
		/**
		* herdr HAS a workspace tier, so the workspace is a fact the backend holds rather than one
		* cyber-mux has to reconstruct: the caller's pane names its `workspace_id`, `tab list --workspace`
		* enumerates that workspace's tabs, and `pane list --workspace` hands back every pane already
		* stamped with the tab it sits in. No grouping tag is read here and none is written — the tier IS
		* the group, which is exactly why `open` ignores `workspaceGroup` on this backend.
		*
		* The one indirection: geometry is per-PANE (`pane layout --pane`), never per-tab, so each tab's
		* rects are fetched through any one pane that sits in it. That is safe and race-free, and both
		* halves were established against 0.7.4: `pane layout` reports live geometry for an UNFOCUSED tab
		* in a DIFFERENT workspace, so nothing has to be focused first and nothing moves while this runs.
		*
		* herdr's own native per-tab layout export would be the obvious road — it takes a `tab_id` — but
		* `layout` is still NOT a CLI verb in 0.8.0 (its top-level help lists no such subcommand); it is
		* socket-API-only, and this adapter speaks the CLI by design (so it composes with the synchronous
		* `Exec` seam). The road is closed, hence the pane indirection.
		*/
		describeWorkspace(exec, target) {
			const { workspaceId } = parsePaneRecord(exec("herdr", [
				"pane",
				"get",
				target.id
			]));
			if (!workspaceId) throw new Error(withReason(exec, `herdr could not resolve the workspace around pane ${target.id}`));
			const out = exec("herdr", [
				"tab",
				"list",
				"--workspace",
				workspaceId
			]);
			if (!out) throw new Error(withReason(exec, `herdr could not enumerate the tabs of workspace ${workspaceId}`));
			let reported;
			try {
				reported = JSON.parse(out)?.result?.tabs;
			} catch {
				throw new Error(`herdr tab list returned unparseable output: ${out.slice(0, 200)}`);
			}
			if (!Array.isArray(reported) || reported.length === 0) throw new Error(`herdr reported no tabs in workspace ${workspaceId}: ${out.slice(0, 200)}`);
			const details = herdrPaneDetails(exec, workspaceId);
			const tabs = [];
			for (const reportedTab of reported) {
				if (typeof reportedTab?.tab_id !== "string") continue;
				const tabId = reportedTab.tab_id;
				const anchor = [...details].find(([, detail]) => detail.tab === tabId)?.[0];
				if (!anchor) throw new Error(`herdr reported no panes in tab ${tabId} of workspace ${workspaceId}`);
				const tab = {
					id: tabId,
					panes: herdrRegionPanes(exec, anchor, details)
				};
				if (typeof reportedTab.label === "string" && reportedTab.label !== "") tab.label = reportedTab.label;
				tabs.push(tab);
			}
			if (tabs.length === 0) throw new Error(`herdr reported no usable tabs in workspace ${workspaceId}: ${out.slice(0, 200)}`);
			return tabs;
		}
	},
	agentLifecycle: { waitForState(exec, target, opts) {
		const until = opts.until ?? [];
		const status = parseReachedAgentStatus(exec("herdr", [
			"agent",
			"wait",
			target.id,
			...until.flatMap((state) => ["--until", state]),
			...opts.timeoutMs != null ? ["--timeout", String(opts.timeoutMs)] : []
		]));
		if (!status) throw new Error(withReason(exec, `herdr agent wait reported no reached agent_status for pane ${target.id}`));
		return status;
	} }
};
/**
* The set of `agent_status` values herdr reports — unchanged through 0.8.0, whose socket schema still
* declares `AgentStatus` as exactly this enum, and whose `agent wait --until` still lists exactly these
* five values. The runtime witness of the `AgentStatus`
* type, so a string read off a herdr envelope can be NARROWED to it rather than cast. A value outside
* this set is treated as absent (the feed said something this build does not model), never forced into
* the type.
*/
const AGENT_STATUSES = [
	"idle",
	"working",
	"blocked",
	"done",
	"unknown"
];
/** A value narrowed to `AgentStatus`, or `undefined` for anything else (a non-string, an empty string,
* or a status this build does not model) — the normalization both the listing and the wait share. */
function toAgentStatus(value) {
	return typeof value === "string" && AGENT_STATUSES.includes(value) ? value : void 0;
}
/**
* The `AgentStatus` a `herdr agent wait` run reached, read defensively from its JSON envelope —
* `{"result":{"agent":{…,"agent_status":"idle",…},"type":"agent_info"}}` (verified against 0.7.5), so
* the reached status lives at `.result.agent.agent_status`. Every unresolvable shape — `out` is null
* (an Exec failure), the JSON does not parse, or the field is missing/empty/unmodeled — folds to
* `undefined`, exactly as `parsePaneRecord`/`isPaneFocused` fold, so the caller states its own failure.
*/
function parseReachedAgentStatus(out) {
	if (out == null) return void 0;
	try {
		return toAgentStatus(JSON.parse(out)?.result?.agent?.agent_status);
	} catch {
		return;
	}
}
/**
* The rects of the region `paneId` sits in, joined with the cwd/label half.
*
* Two sources, because herdr splits the answer across two verbs: `pane layout` reports the region's
* rects (`layout.panes[].rect`) but carries no cwd and no label, while `pane list` carries both and
* no geometry. Neither alone can build a template — hence `details` is passed IN, so a caller reading
* many tabs pays for that list once rather than once per tab.
*
* `layout.splits[]` is deliberately ignored even though it reports `direction` and `ratio` outright.
* It is FLAT — `[{id:"split_0_root",...},{id:"split_1_0",...}]` — so the tree is recoverable only by
* parsing the parent out of that id string, a convention herdr's CLI help never documents and could
* respell without warning. The rects say the same thing in a fact herdr does promise, so the
* derivation runs off those; see `RegionInspector.describeRegion` in `mux.ts`.
*/
function herdrRegionPanes(exec, paneId, details) {
	const out = exec("herdr", [
		"pane",
		"layout",
		"--pane",
		paneId
	]);
	if (!out) throw new Error(withReason(exec, `herdr could not describe the region around pane ${paneId}`));
	let reported;
	try {
		reported = JSON.parse(out)?.result?.layout?.panes;
	} catch {
		throw new Error(`herdr pane layout returned unparseable output: ${out.slice(0, 200)}`);
	}
	if (!Array.isArray(reported) || reported.length === 0) throw new Error(`herdr pane layout reported no panes for ${paneId}: ${out.slice(0, 200)}`);
	return reported.filter((p) => typeof p?.pane_id === "string").map((p) => {
		const detail = details.get(p.pane_id);
		const pane = {
			id: p.pane_id,
			rect: {
				x: p.rect?.["x"] ?? 0,
				y: p.rect?.["y"] ?? 0,
				width: p.rect?.["width"] ?? 0,
				height: p.rect?.["height"] ?? 0
			}
		};
		if (detail?.cwd) pane.cwd = detail.cwd;
		if (detail?.label) pane.label = detail.label;
		return pane;
	});
}
/**
* Each pane's cwd, label and tab, keyed by pane id — the half `pane layout` does not report.
*
* `workspace` scopes the list to one workspace when the caller has one to scope by; omitting it lists
* every pane herdr can see, which is what a single-region read wants (it keys by pane id and never
* cares which workspace a pane came from).
*/
function herdrPaneDetails(exec, workspace) {
	const details = /* @__PURE__ */ new Map();
	const out = exec("herdr", [
		"pane",
		"list",
		...workspace ? ["--workspace", workspace] : []
	]);
	if (!out) return details;
	let panes;
	try {
		panes = JSON.parse(out)?.result?.panes;
	} catch {
		return details;
	}
	if (!Array.isArray(panes)) return details;
	for (const pane of panes) {
		if (typeof pane?.pane_id !== "string") continue;
		details.set(pane.pane_id, {
			cwd: pane.cwd,
			label: pane.label,
			tab: pane.tab_id
		});
	}
	return details;
}
/**
* herdr's repeatable `--env KEY=VALUE` — spelled the same way by exactly three verbs: `pane split`,
* `workspace create` and `tab create`, each backed by a native `env` Record in the socket schema
* (protocol 16).
*
* `worktree create`/`worktree open` are deliberately NOT in that list: their params are
* `[base, branch, cwd, focus, label, path, workspace_id]` and
* `[branch, cwd, focus, label, path, workspace_id]` — no `env` — and herdr rejects the flag with
* `unknown option: --env`. A caller needing env on that route uses the command-prefix fallback.
* Re-verified against 0.8.0: both param sets are unchanged in protocol 19's schema, and a live
* `worktree create --env` there still answers `unknown option: --env`.
*/
function envFlags(env) {
	return env ? Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]) : [];
}
/**
* `--ratio` takes the seam's number VERBATIM — herdr sizes the ORIGINAL pane, so no inversion, unlike
* tmux's `-l` and wezterm's `--percent`. The guard is the same one those two render helpers call: the
* seam refuses an out-of-range ratio here rather than pass `--ratio 5` (or `0`) through to a split herdr
* would then size wrong.
*/
function toHerdrRatio(ratio) {
	assertRatioInRange(ratio);
	return String(ratio);
}
/**
* Launch a command in a worktree's root pane, carrying env the worktree verb could not set at birth.
* The prefix-or-warn rule is the seam's (`env-fallback.ts`); this is the one route that invokes it,
* because it is the one route that loses env. With a command, env rides in as a prefix; with none and
* env asked for, it warns to stderr (stdout stays machine-readable) rather than dropping in silence.
*/
function carryLaunch(exec, target, env, launch) {
	const fallback = envFallback(env, launch);
	if (fallback.kind === "dropped") {
		process.stderr.write(`env (${fallback.variables.join(", ")}) could not be set on this worktree's workspace and no command was given to carry it — herdr worktree create/open take no env parameter
`);
		return;
	}
	if (fallback.command !== void 0) herdrMuxAdapter.submit(exec, target, fallback.command);
}
/**
* `herdr pane split` emits a JSON envelope, not a bare id:
* `{"id":"cli:pane:split","result":{"pane":{"pane_id":"w3:pB", ...},"type":"pane_info"}}`.
* The pane id herdr's other `pane` subcommands accept lives at `.result.pane.pane_id`. Extract it —
* passing the whole blob downstream lands it in a filename and blows the path length limit.
*/
function parsePaneId(out) {
	return parseOpenedPane(out, "herdr pane split", "pane");
}
/**
* `herdr pane get <id>` emits `{"result":{"pane":{"workspace_id":...,"tab_id":...,...}}}`, or an
* error envelope when the id no longer names a live pane. Every unresolvable shape — `out` is null
* (an Exec failure), the JSON does not parse, or a field is missing/empty/not a string — folds to the
* field simply being absent, so each caller states its OWN failure rather than inheriting one
* phrased for somebody else's verb.
*/
function parsePaneRecord(out) {
	if (out == null) return {};
	try {
		const pane = JSON.parse(out)?.result?.pane;
		return {
			workspaceId: nonEmpty(pane?.workspace_id),
			tabId: nonEmpty(pane?.tab_id)
		};
	} catch {
		return {};
	}
}
function nonEmpty(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
/**
* The `code` of a herdr error envelope, when the runner captured one — how a wait's TIMEOUT (an answer)
* is told from any other failure (a throw). Read from `Exec.lastError` because that is where herdr's
* envelope lands: it is written to stderr with exit 1, so stdout is `null` for every failure alike and
* the code is the only thing that separates them. Defensive throughout — no reason, unparseable JSON, or
* a missing/non-string code all answer `undefined`, which routes to the throw rather than to a silent
* "timed out" the backend never said.
*/
/**
* How much of its own timeout a wait must actually spend before a failure is believed to BE that
* timeout. A fraction rather than the whole, because process start-up and clock granularity make an
* exact-or-greater comparison flaky on a real runner; wide enough that the case it exists to catch — a
* herdr with no `wait-output` subcommand, which returns in milliseconds — is nowhere near it.
*/
const HERDR_WAIT_ELAPSED_RATIO = .9;
/**
* Whether a failed `pane wait-output` was the DEADLINE passing rather than the wait breaking — the
* two-tier rule `waitForOutput` documents, kept out of the method so the tiers read as one decision.
*
* The envelope's code answers when the runner captured one. Otherwise the answer needs two facts, and
* neither alone is enough: the pane must be LIVE (a gone pane is a failure, `pollForOutput`'s rule) and
* the call must have SPENT the deadline (a wait that returned instantly never ran — herdr 0.7.4, whose
* usage text for an unknown subcommand is not an envelope to read a code from).
*/
function isHerdrWaitTimeout(exec, target, timeoutMs, elapsedMs) {
	const code = herdrErrorCode(exec.lastError);
	if (code != null) return code === "timeout";
	if (elapsedMs < timeoutMs * HERDR_WAIT_ELAPSED_RATIO) return false;
	return herdrMuxAdapter.paneExists(exec, target);
}
function herdrErrorCode(reason) {
	if (!reason) return void 0;
	try {
		return nonEmpty(JSON.parse(reason)?.error?.code);
	} catch {
		return;
	}
}
/**
* A successful `pane wait-output` envelope: the snapshot it matched in, and the line it matched on.
*
* `matched` is `true` by construction — herdr exits 0 only on a match, so reaching here IS the match;
* the parse only fills in the evidence. Defensive for the same reason `parsePaneRecord` is: a herdr
* build that reshapes the envelope degrades to a match with no snapshot, never to a failed wait.
*/
function parseWaitOutput(out) {
	let text;
	let line;
	try {
		const result = JSON.parse(out)?.result;
		text = nonEmpty(result?.read?.text);
		line = nonEmpty(result?.matched_line);
	} catch {}
	return {
		matched: true,
		output: text ?? "",
		...line != null ? { matchedLine: line } : {}
	};
}
/**
* The pane's workspace and tab, or a throw — so `focus` never issues a workspace/tab switch against a
* pane it couldn't actually resolve.
*/
function parsePaneLocation$1(out, id) {
	const { workspaceId, tabId } = parsePaneRecord(out);
	if (!workspaceId || !tabId) throw new Error(`peer's pane ${id} could not be resolved to beam to`);
	return {
		workspaceId,
		tabId
	};
}
/**
* herdr binds a git worktree to a workspace as a first-class record, and that binding is what its UI
* groups a repo's checkouts by. Only `worktree create`/`worktree open` produce it: `git worktree add`
* followed by `workspace create --cwd <checkout>` yields a workspace herdr does not know is a
* worktree at all, left out of the group. Hence this capability — see `WorktreeWorkspaceCapability`
* for what it deliberately does not own.
*
* Every call pins the source repo with `--cwd <primaryRoot>` rather than relying on the caller's
* ambient process cwd (matching how the git adapter always passes `-C <primaryRoot>`), and opens
* with `--no-focus` so spawning never steals the caller's attention.
*/
function herdrWorktreeCapability() {
	return {
		createInWorkspace(exec, opts) {
			const args = [
				"worktree",
				"create",
				"--cwd",
				opts.primaryRoot,
				"--branch",
				opts.branch,
				"--path",
				opts.path
			];
			if (opts.base) args.push("--base", opts.base);
			if (opts.label) args.push("--label", opts.label);
			args.push("--no-focus");
			const out = exec("herdr", args);
			if (!out) throw new Error(withReason(exec, "herdr worktree create failed"));
			const created = parseWorktreeWorkspace(out, "herdr worktree create");
			carryLaunch(exec, created.target, opts.env, opts.launch);
			return created;
		},
		openInWorkspace(exec, opts) {
			const args = [
				"worktree",
				"open",
				"--cwd",
				opts.primaryRoot,
				"--path",
				opts.path
			];
			if (opts.label) args.push("--label", opts.label);
			args.push("--no-focus");
			const out = exec("herdr", args);
			if (!out) throw new Error(withReason(exec, "herdr worktree open failed"));
			const opened = parseWorktreeWorkspace(out, "herdr worktree open");
			carryLaunch(exec, opened.target, opts.env, opts.launch);
			return opened;
		},
		bindings(exec, opts) {
			return parseWorktreeBindings(exec("herdr", [
				"worktree",
				"list",
				"--cwd",
				opts.primaryRoot
			]));
		},
		releaseWorkspace(exec, workspace) {
			exec("herdr", [
				"workspace",
				"close",
				workspace
			]);
		}
	};
}
/**
* `herdr workspace create` and `herdr tab create` both emit their new root pane at
* `.result.root_pane.pane_id` (a different path than `pane split`'s `.result.pane.pane_id`).
* `label` names the command in error messages (e.g. "herdr workspace create").
*/
function parseRootPaneId(out, label) {
	return parseOpenedPane(out, label, "root_pane");
}
/**
* Every pane herdr emits carries its own `workspace_id` alongside its `pane_id`, on EVERY route —
* `workspace create` (which reports the workspace it just made), `tab create` (the workspace the tab
* was created in), and `pane split` (the workspace the split landed in, i.e. the caller's). Re-verified
* against herdr 0.8.0. That is why the workspace costs no extra call: it rides in on the same output
* the pane id is already read from, so probing for it separately would buy nothing and cost a round
* trip per open.
*
* The pane id is required — a route that cannot name its pane has failed. The workspace is NOT: it
* is read opportunistically and left absent when missing rather than throwing, so a herdr build that
* stops emitting it degrades to "cannot say" instead of breaking `open` outright. Absent is a
* meaning this seam already has (`OpenedPane.workspace`); a hard failure here would be inventing a
* new one for a field no caller is required to use.
*/
function parseOpenedPane(out, label, key) {
	let pane;
	try {
		pane = JSON.parse(out)?.result?.[key];
	} catch {
		throw new Error(`${label} returned unparseable output: ${out.slice(0, 200)}`);
	}
	const paneId = pane?.pane_id;
	if (typeof paneId !== "string" || paneId === "") throw new Error(`${label} output had no result.${key}.pane_id: ${out.slice(0, 200)}`);
	const tab = pane?.tab_id;
	if (typeof tab !== "string" || tab === "") throw new Error(`${label} output had no result.${key}.tab_id: ${out.slice(0, 200)}`);
	const workspace = pane?.workspace_id;
	return typeof workspace === "string" && workspace !== "" ? {
		id: paneId,
		tab,
		workspace
	} : {
		id: paneId,
		tab
	};
}
/**
* `herdr worktree create` and `herdr worktree open` emit the same envelope: the root pane at
* `.result.root_pane.pane_id` (as `workspace create` does), the checkout at
* `.result.worktree.{path,branch}`, and the bound workspace at `.result.workspace.workspace_id`.
* That workspace id IS the binding — the whole reason to route through these instead of plain git.
* `label` names the command in error messages (e.g. "herdr worktree create").
*
* The root pane is read through `parseOpenedPane`, NOT re-parsed here: `root_pane` is the same record
* `workspace create` emits, so it carries the same `tab_id`, and one spelling is what keeps the two
* routes from disagreeing about a field both report. That tab is the region's root tab — what lets a
* caller handed this workspace group or rename it without reaching for the pane id, which would be
* green on tmux and silently broken on herdr.
*/
function parseWorktreeWorkspace(out, label) {
	let parsed;
	try {
		parsed = JSON.parse(out);
	} catch {
		throw new Error(`${label} returned unparseable output: ${out.slice(0, 200)}`);
	}
	const result = parsed?.result;
	const target = parseOpenedPane(out, label, "root_pane");
	const workspace = result?.workspace?.workspace_id;
	const path = result?.worktree?.path;
	const branch = result?.worktree?.branch;
	if (typeof path !== "string" || path === "" || typeof branch !== "string" || branch === "") throw new Error(`${label} output had no result.worktree.{path,branch}: ${out.slice(0, 200)}`);
	if (typeof workspace !== "string" || workspace === "") throw new Error(`${label} output had no result.workspace.workspace_id: ${out.slice(0, 200)}`);
	return {
		target,
		worktree: {
			root: resolve(path),
			branch
		},
		workspace
	};
}
/**
* `herdr worktree list` reports every worktree of the repo, each carrying `open_workspace_id` ONLY
* while a workspace is currently open on it. Everything else it reports (branch, linked, prunable)
* is herdr re-reading git — deliberately ignored here; git answers those for every backend.
* Defensive like `listPanes`: a query that cannot be read reports nothing rather than throwing.
*/
function parseWorktreeBindings(out) {
	const bindings = /* @__PURE__ */ new Map();
	if (!out) return bindings;
	let parsed;
	try {
		parsed = JSON.parse(out);
	} catch {
		return bindings;
	}
	const worktrees = parsed?.result?.worktrees ?? [];
	if (!Array.isArray(worktrees)) return bindings;
	for (const entry of worktrees) {
		const path = entry?.path;
		const workspace = entry?.open_workspace_id;
		if (typeof path === "string" && path !== "" && typeof workspace === "string" && workspace !== "") bindings.set(normalizeWorktreePath(path), workspace);
	}
	return bindings;
}
/**
* One spelling of `pane read`, taken by `read` for the snapshot AND for its truncation probe — so the
* two differ only in the source and depth they are meant to differ in. `lines` omitted takes herdr's
* own default window for the source.
*/
function paneRead(exec, target, source, lines) {
	const args = [
		"pane",
		"read",
		target.id,
		"--source",
		source
	];
	if (lines != null) args.push("--lines", String(lines));
	return exec("herdr", args) ?? "";
}
/**
* The tmux window user option `MuxOpenOptions.workspaceGroup` is stored in. A user option (the
* `@` prefix) is tmux's own mechanism for a value it stores but never interprets, so tmux carries
* the tag without cyber-mux teaching it anything: it survives a window rename, and `list-windows`
* both reads it back (`#{@cm_ws}`) and filters on it server-side (`-f '#{==:#{@cm_ws},<id>}'`).
*
* Named here rather than spelled at each use so the write side and every read side cannot drift.
* Server-lifetime, like every window: it dies with the tmux server, along with the windows it tags.
*/
const TMUX_WORKSPACE_GROUP_OPTION = "@cm_ws";
/**
* The tmux window user option a grouped window's OWN name is stored in — the name the caller gave the
* tab, beside the group id, because tmux's single `window_name` field no longer holds it.
*
* tmux has ONE name field per space. A caller that composes a display name out of a tab's name
* (`pool - editor`) has destroyed `editor`, and there is no sound way back: splitting on the separator
* is ambiguous (`acme - beta - main` reads two legal ways), and reading the display name verbatim
* re-prefixes it on every round trip (`pool - pool - editor`). So the original is stored here and read
* back from here — the same rule the group id follows, one tier down. The display name is a human's to
* read; this is what a machine reads.
*
* A user option (the `@` prefix) for `TMUX_WORKSPACE_GROUP_OPTION`'s reasons exactly: tmux stores it
* without interpreting it, it survives a window rename, and `list-windows` reads it back
* (`#{@cm_tab}`). Named here rather than spelled at each use so the write side and every read side
* cannot drift.
*/
const TMUX_TAB_NAME_OPTION = "@cm_tab";
/** tmux backend — detected via `$TMUX`. */
const tmuxMuxAdapter = {
	name: "tmux",
	canSizeSplits: true,
	/**
	* `new-pane` opens a floating pane — tmux 3.7's own new command ("Add floating panes. These are
	* panes which sit above the layout ('tiled panes') like popups but unlike popups are not modal and
	* behave like panes", CHANGES 3.6b → 3.7), bound to `*` by default.
	*
	* Declared UNCONDITIONALLY rather than probed off `tmux -V`, and that is deliberate: this adapter
	* takes no version reading anywhere (its `-l`, `-e` and `@`-option paths are all declared the same
	* way), and a version probe would cost an exec on every resolution to pre-empt a failure tmux
	* already reports precisely. On tmux ≤ 3.6 the command does not exist and `new-pane` fails with
	* tmux's own `unknown command` — surfaced by the `withReason` throw in `open`, which names the
	* command that failed. A silent wrong-pane is the failure mode worth engineering against, and this
	* has none: there is nothing for an absent `new-pane` to be mistaken for.
	*
	* Both sides of this placement are now pinned against a real 3.7c binary — the read side by
	* `#{pane_floating_flag}`, the create side by the `new-pane` rows in `mux.tmux.integration.test.ts`.
	* The branch below was originally written off tmux's CHANGES file, because the tmux installed when
	* it landed was 3.6b and had no `new-pane` to run it against.
	*/
	canFloatPanes: true,
	open(exec, opts) {
		const at = opts.at ?? "tab";
		const window = at === "workspace" || at === "tab";
		const env = opts.env ? Object.entries(opts.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]) : [];
		const group = window && opts.workspaceGroup != null;
		const format = "#{pane_id}	#{window_id}";
		let args;
		if (at === "pane:float") args = [
			"new-pane",
			...opts.from ? ["-t", opts.from.id] : [],
			...env,
			"-c",
			opts.cwd,
			"-P",
			"-F",
			format
		];
		else if (window) args = [
			"new-window",
			"-d",
			...env,
			"-c",
			opts.cwd,
			"-P",
			"-F",
			format
		];
		else {
			const from = opts.from ? ["-t", opts.from.id] : [];
			const size = opts.ratio != null ? ["-l", toTmuxSize(opts.ratio)] : [];
			args = [
				"split-window",
				at === "pane:down" ? "-v" : "-h",
				...from,
				...size,
				...env,
				"-c",
				opts.cwd,
				"-P",
				"-F",
				format
			];
		}
		if (window && opts.label) args.splice(1, 0, "-n", opts.label);
		const out = exec("tmux", args);
		if (!out) throw new Error(withReason(exec, `tmux ${args[0]} failed`));
		const [pane, windowId] = splitOpenReport(out, args[0]);
		const target = {
			id: pane,
			tab: windowId
		};
		if (group && windowId) tmuxMuxAdapter.group(exec, { id: windowId }, opts.workspaceGroup);
		if (!window && opts.label) tmuxMuxAdapter.rename(exec, target, "pane", opts.label);
		if (opts.launch) tmuxMuxAdapter.submit(exec, target, opts.launch);
		return target;
	},
	rename(exec, target, tier, name) {
		if (tier === "tab") {
			exec("tmux", [
				"rename-window",
				"-t",
				target.id,
				name
			]);
			return;
		}
		exec("tmux", [
			"select-pane",
			"-t",
			target.id,
			"-T",
			name
		]);
	},
	group(exec, target, group, name) {
		exec("tmux", [
			"set-option",
			"-w",
			"-t",
			target.id,
			TMUX_WORKSPACE_GROUP_OPTION,
			group
		]);
		if (name !== void 0) exec("tmux", [
			"set-option",
			"-w",
			"-t",
			target.id,
			TMUX_TAB_NAME_OPTION,
			name
		]);
	},
	sendText(exec, target, text) {
		exec("tmux", [
			"send-keys",
			"-t",
			target.id,
			"-l",
			text
		]);
	},
	sendKeys(exec, target, keys) {
		exec("tmux", [
			"send-keys",
			"-t",
			target.id,
			...keys.map(toTmuxKey)
		]);
	},
	submit(exec, target, text) {
		if (!text) {
			exec("tmux", [
				"send-keys",
				"-t",
				target.id,
				"Enter"
			]);
			return;
		}
		tmuxMuxAdapter.sendText(exec, target, text);
		exec("tmux", [
			"send-keys",
			"-t",
			target.id,
			"Enter"
		]);
	},
	read(exec, target, opts) {
		const text = capturePane(exec, target, opts?.lines);
		if (!opts?.truncation) return { text };
		if (opts.lines === "all") return {
			text,
			truncated: false
		};
		return {
			text,
			truncated: isReadTruncated(text, capturePane(exec, target, (opts.lines ?? 0) + 1))
		};
	},
	waitForOutput(exec, target, opts) {
		return pollForOutput(tmuxMuxAdapter, exec, target, opts);
	},
	focus(exec, target) {
		const { sessionName, windowId } = parsePaneLocation(exec("tmux", [
			"list-panes",
			"-a",
			"-F",
			"#{pane_id} #{session_name} #{window_id}"
		]), target.id);
		exec("tmux", [
			"switch-client",
			"-t",
			sessionName
		]);
		exec("tmux", [
			"select-window",
			"-t",
			windowId
		]);
		exec("tmux", [
			"select-pane",
			"-t",
			target.id
		]);
	},
	teardown(exec, target) {
		exec("tmux", [
			"kill-pane",
			"-t",
			target.id
		]);
	},
	paneExists(exec, target) {
		if (exec("tmux", [
			"has-session",
			"-t",
			target.id
		]) !== null) return true;
		return (exec("tmux", [
			"list-panes",
			"-a",
			"-F",
			"#{pane_id}"
		]) ?? "").split("\n").includes(target.id);
	},
	isPaneFocused(exec, target) {
		const out = exec("tmux", [
			"list-panes",
			"-a",
			"-F",
			"#{pane_id} #{pane_active} #{window_active} #{session_attached}"
		]);
		if (!out) return void 0;
		const line = out.split("\n").find((l) => l.split(" ")[0] === target.id);
		if (!line) return void 0;
		const [, paneActive, windowActive, sessionAttached] = line.split(" ");
		return paneActive === "1" && windowActive === "1" && sessionAttached !== "0" && sessionAttached !== void 0;
	},
	/**
	* Tab-separated, not space — the same rule `describeTmuxRegion` follows, and for the same reason:
	* `pane_current_path` and `pane_title` can both contain spaces. The old space-separated format
	* recovered the cwd by rejoining everything after the command, which works only while the cwd is
	* the LAST field. A label is a human's and may hold anything, so appending one to that format would
	* make both fields unrecoverable — `my worker` and `/repo/my dir` cannot be told apart by a space.
	* A tab can appear in neither id nor command, and the two free-text fields are separated by one.
	*/
	listPanes(exec) {
		const out = exec("tmux", [
			"list-panes",
			"-a",
			"-F",
			"#{pane_id}	#{pane_current_command}	#{pane_current_path}	#{pane_title}	#{host}	#{pane_floating_flag}"
		]);
		if (!out) return [];
		return out.split("\n").filter(Boolean).map((line) => {
			const [id, , cwd, title, host, floating] = line.split("	");
			const pane = {
				id: id ?? "",
				mux: "tmux",
				floating: floating === "1"
			};
			if (cwd) pane.cwd = cwd;
			const label = paneLabel(title, host);
			if (label) pane.label = label;
			return pane;
		}).filter((p) => p.id !== "");
	},
	regions: {
		describeRegion(exec, target) {
			return describeTmuxRegion(exec, target.id);
		},
		/**
		* tmux has NO workspace tier — `workspace` and `tab` both collapse onto a Window — so a workspace
		* is not a fact this backend holds. What it holds is the grouping TAG the walk wrote
		* (`MuxOpenOptions.workspaceGroup`, stored in a window user option), so the read here is
		* literally *"which windows carry this group id"*.
		*
		* The tag, never the label. `list-windows -a` spans SESSIONS, so a bare name match would
		* over-collect a same-named window from another session, and taking the workspace off a
		* `<workspace> - <tab>` label is unsound in the first place (`acme - beta - main` splits two ways,
		* both legal). `-f '#{==:#{@cm_ws},<id>}'` keys on what actually identifies the group, filtered
		* server-side — the tag survives a window rename, which a name-encoded grouping does not.
		*
		* A window with NO tag is a workspace of ONE: the honest answer for a window nobody grouped, and
		* it costs no further call — the caller's own window is the whole workspace.
		*/
		describeWorkspace(exec, target) {
			const out = exec("tmux", [
				"display-message",
				"-p",
				"-t",
				target.id,
				`#{window_id}\t#{${TMUX_WORKSPACE_GROUP_OPTION}}\t#{${TMUX_TAB_NAME_OPTION}}\t#{window_name}`
			]);
			if (!out) throw new Error(withReason(exec, `tmux could not resolve the workspace around pane ${target.id}`));
			const [windowId, group, ownName, ...nameParts] = out.split("\n")[0].split("	");
			if (!windowId) throw new Error(`tmux did not report the window around pane ${target.id}`);
			if (!group) return [tmuxTab(exec, windowId, ownName, nameParts.join("	"))];
			const listed = exec("tmux", [
				"list-windows",
				"-a",
				"-F",
				`#{window_id}\t#{${TMUX_TAB_NAME_OPTION}}\t#{window_name}`,
				"-f",
				`#{==:#{${TMUX_WORKSPACE_GROUP_OPTION}},${group}}`
			]);
			if (!listed) throw new Error(withReason(exec, `tmux could not enumerate the windows grouped as ${group}`));
			const tabs = listed.split("\n").filter(Boolean).map((line) => line.split("	")).filter(([id]) => Boolean(id)).map(([id, own, ...rest]) => tmuxTab(exec, id, own, rest.join("	")));
			if (tabs.length === 0) throw new Error(`tmux reported no windows grouped as ${group}`);
			return tabs;
		}
	}
};
/**
* One window, read as a tab: its id, the tab's OWN name, and its region's geometry.
*
* `ownName` is what `group` stored (`TMUX_TAB_NAME_OPTION`) and it WINS, because `windowName` is the
* display name — on a grouped window that is the composed `pool - editor`, whose `editor` tmux's
* single name field no longer holds. Reporting the display name instead would compound the prefix on
* every capture/apply round trip (`pool - pool - editor`), and splitting it back apart is the unsound
* parse the option exists to refuse.
*
* The window name is the FALLBACK, not a second guess: a window carrying no stored name is one nobody
* composed a display name for, so its name already IS its own name. That covers the untagged window —
* a workspace of one — and any window a caller grouped without naming.
*/
function tmuxTab(exec, windowId, ownName, windowName) {
	const tab = {
		id: windowId,
		panes: describeTmuxRegion(exec, windowId)
	};
	const label = ownName || windowName;
	if (label) tab.label = label;
	return tab;
}
/**
* Every pane of the region `id` names, with its rectangle. `id` is a pane id (that pane's own window)
* or a window id (that window) — `list-panes -t` resolves both, which is what lets the region read and
* the workspace read share one query instead of two that could drift apart.
*
* `-t` scopes `list-panes` to ONE window — the region tier, which is what capture captures. Without
* `-a`, so this never reaches the panes of some other window.
*
* `#{pane_left}`/`#{pane_top}` are window-relative, and the widths exclude the divider column tmux
* draws between panes (a 200-wide window split side by side reports 119 + 80, not 200) — both are
* exactly what `RegionPane.rect` documents, so nothing is adjusted here.
*
* Tab-separated, not space: `pane_current_path` and `pane_title` can both contain spaces, and
* splitting a path on spaces is how a directory with one in it silently becomes the wrong pane.
*/
function describeTmuxRegion(exec, id) {
	const out = exec("tmux", [
		"list-panes",
		"-t",
		id,
		"-F",
		"#{pane_id}	#{pane_left}	#{pane_top}	#{pane_width}	#{pane_height}	#{pane_current_path}	#{pane_title}	#{host}"
	]);
	if (!out) throw new Error(withReason(exec, `tmux could not describe the region around pane ${id}`));
	const panes = [];
	for (const line of out.split("\n").filter(Boolean)) {
		const [paneId, left, top, width, height, cwd, title, host] = line.split("	");
		if (!paneId) continue;
		const pane = {
			id: paneId,
			rect: {
				x: Number(left),
				y: Number(top),
				width: Number(width),
				height: Number(height)
			}
		};
		if (cwd) pane.cwd = cwd;
		const label = paneLabel(title, host);
		if (label) pane.label = label;
		panes.push(pane);
	}
	if (panes.length === 0) throw new Error(`tmux reported no panes in the region around pane ${id}`);
	return panes;
}
/**
* A tmux pane's label — its title, unless that title is the hostname tmux handed it.
*
* **tmux has no "unset title"**: it defaults `pane_title` to the hostname, so a pane nobody ever named
* reports a name nobody chose, and every pane in an untouched session reports the SAME one. Exporting
* that would label them all `zeta`, and `zeta` would then resolve to every pane in the session —
* ambiguity manufactured out of nothing. A title that differs from the host is one someone set
* (cyber-mux's own `select-pane -T` among them), so it is the author's and survives.
*
* One home for the rule, called by BOTH reads — `listPanes` (which a name resolves against) and
* `describeTmuxRegion` (which a capture exports). Two spellings of a heuristic this load-bearing is
* how the listing and the capture come to disagree about which panes are named.
*
* The comparison is the workaround, not the shape of the thing: herdr has the honest primitive and
* omits the key outright until a pane is renamed, so it needs no rule at all.
*/
function paneLabel(title, host) {
	return title && title !== host ? title : void 0;
}
/**
* The `-P -F '#{pane_id}\t#{window_id}'` report EVERY open asks for, split back into its two ids.
* Tab-separated because neither id can contain a tab.
*
* A report that does not carry both throws rather than returning half an answer: the window is the
* pane's tab, which `OpenedPane.tab` promises is always present, and it is also what a grouping open
* tags. Guessing either would be worse than failing — a caller would name or group nothing and never
* learn it.
*/
function splitOpenReport(out, command) {
	const [pane, windowId] = out.split("	");
	if (!pane || !windowId) throw new Error(`tmux ${command} did not report the new pane's id and window id`);
	return [pane, windowId];
}
/**
* `ratio` is the fraction kept by the ORIGINAL pane; tmux's `-l` sizes the NEW one. So this INVERTS
* — `1 - ratio` — where herdr's `--ratio` passes the same number through untouched. The two backends
* genuinely convert in opposite directions, and applying the inversion to both (or to neither) is
* the way this gets silently backwards: a 0.333 template would size the original pane at 67%.
*
* Percent rather than cells: tmux takes `-l` as either, and a percentage is the only form that means
* the same thing without first querying the region's size.
*/
function toTmuxSize(ratio) {
	assertRatioInRange(ratio);
	return `${Math.round((1 - ratio) * 100)}%`;
}
/**
* The core vocabulary's tmux spelling. Exactly one member differs — probed, not read off tmux(1):
* tmux has no `Backspace` key name, so it would *type* the word (its unrecognized-token fallback);
* its name for that key is `BSpace` (tmux(1): "the following special key names are accepted: Up,
* Down, Left, Right, BSpace, BTab, DC ..."). Every other core key — `Up` `Down` `Left` `Right`
* `Enter` `Escape` `Tab` `Space` `C-c` `F1`-`F12` — is already tmux's own name for it.
*
* Deliberately a rename table, NOT a validation table: a token outside the core is forwarded
* verbatim (the contract), so this must not reject what it does not recognize. Keeping a full tmux
* key list here would make the passthrough a second vocabulary to maintain.
*/
const TMUX_KEY_RENAMES = { Backspace: "BSpace" };
/**
* One spelling of the capture, taken by `read` for the snapshot AND for the one-row-deeper truncation
* probe — so the two differ in exactly the number they disagree about and nothing else. `lines`
* omitted is tmux's own default window: the visible screen, with no `-S` at all.
*/
function capturePane(exec, target, lines) {
	const args = [
		"capture-pane",
		"-p",
		"-t",
		target.id
	];
	if (lines === "all") args.push("-S", "-");
	else if (lines != null) args.push("-S", `-${lines}`);
	return exec("tmux", args) ?? "";
}
function toTmuxKey(key) {
	return TMUX_KEY_RENAMES[key] ?? key;
}
/**
* `tmux list-panes -a -F '#{pane_id} #{session_name} #{window_id}'` lists every pane server-wide.
* Resolving fails — no line's pane id matches `id` — when the pane no longer exists in the backend,
* and that must throw so `focus` never issues a switch-client/select-window against a pane it
* couldn't actually resolve.
*/
function parsePaneLocation(out, id) {
	const line = (out ?? "").split("\n").find((l) => l.split(" ")[0] === id);
	if (!line) throw new Error(`peer's pane ${id} could not be resolved to beam to`);
	const [, sessionName, windowId] = line.split(" ");
	return {
		sessionName,
		windowId
	};
}
const KNOWN_MUX = [
	"tmux",
	"herdr",
	"wezterm",
	"zellij",
	"cmux",
	"otty",
	"screen",
	"none"
];
function isKnownMux(v) {
	return v != null && KNOWN_MUX.includes(v);
}
/**
* The single source of the mux → per-pane-env-var mapping. tmux exports `$TMUX_PANE`; herdr exports
* `$HERDR_PANE_ID` (both in the same `wX:pY`-style namespace); WezTerm exports `$WEZTERM_PANE` in
* every pane (its own bare-integer id) — per the issue that requested that backend (#47), the same
* fast-path extension `$TMUX_PANE`/`$HERDR_PANE_ID` already get; Zellij exports `$ZELLIJ_PANE_ID` in
* every terminal pane (its own `terminal_N`/bare-`N` id) — per the issue that requested this backend
* (#46); cmux exports `$CMUX_SURFACE_ID` in every terminal (its surface ref, e.g. `surface:7`) — per
* the issue that requested this backend (#48). screen carries no per-pane env var. Both the ancestry
* probe and the `currentPane` self-identity helper read the pane through this table so the two never
* diverge on which env var a given mux uses.
*/
const PANE_ENV = {
	tmux: (env) => env["TMUX_PANE"],
	herdr: (env) => env["HERDR_PANE_ID"],
	wezterm: (env) => env["WEZTERM_PANE"],
	zellij: (env) => env["ZELLIJ_PANE_ID"],
	cmux: (env) => env["CMUX_SURFACE_ID"],
	otty: (env) => env["OTTY_PANE_ID"]
};
/**
* Resolve THIS session's own pane from env alone (no `ps` walk): the `$CYBER_MUX_PANE` fast-path a
* spawn propagates → `$TMUX_PANE` (tmux) → `$HERDR_PANE_ID` (herdr) → `$WEZTERM_PANE` (wezterm) →
* `$ZELLIJ_PANE_ID` (zellij) → `$CMUX_SURFACE_ID` (cmux) → `$OTTY_PANE_ID` (otty). Returns the pane
* tagged with its multiplexer, or undefined when the session is in no pane-carrying multiplexer.
* This is the mux-agnostic self-identity key.
*/
function currentPane(env) {
	if (env["CYBER_MUX_PANE"]) return {
		mux: env["CYBER_MUX"] === "herdr" ? "herdr" : env["CYBER_MUX"] === "wezterm" ? "wezterm" : env["CYBER_MUX"] === "zellij" ? "zellij" : env["CYBER_MUX"] === "cmux" ? "cmux" : env["CYBER_MUX"] === "otty" ? "otty" : "tmux",
		pane: env["CYBER_MUX_PANE"]
	};
	const tmux = PANE_ENV.tmux(env);
	if (tmux) return {
		mux: "tmux",
		pane: tmux
	};
	const herdr = PANE_ENV.herdr(env);
	if (herdr) return {
		mux: "herdr",
		pane: herdr
	};
	const wezterm = PANE_ENV.wezterm(env);
	if (wezterm) return {
		mux: "wezterm",
		pane: wezterm
	};
	const zellij = PANE_ENV.zellij(env);
	if (zellij) return {
		mux: "zellij",
		pane: zellij
	};
	const cmux = PANE_ENV.cmux(env);
	if (cmux) return {
		mux: "cmux",
		pane: cmux
	};
	const otty = PANE_ENV.otty(env);
	if (otty) return {
		mux: "otty",
		pane: otty
	};
}
/**
* Two-mode multiplexer detection.
*
* Fast-path: `$CYBER_MUX` (tmux | herdr | wezterm | zellij | screen | none) is trusted outright —
* this also serves as an OVERRIDE (`=none` forces no-mux even inside a real multiplexer).
* `$CYBER_MUX_PANE` carries the pane id alongside it. Detection RECOGNIZES `screen` (so an override
* pinning it, or a real screen ancestor, is reported truthfully rather than silently ignored), but
* `screen` is not a drivable backend — `resolveMuxAdapter` rejects it with a reason. Recognition is
* not support.
*
* Discovery (else): walk the process ancestry from `$$` via `ps -o ppid=,comm= -p <pid>`, since the
* tool's own shell may not be the human's pane. `$TMUX`/`$HERDR_ENV` are NOT trusted alone — they
* are used only as a fast-positive hint the ancestry walk falls back to when the walk itself is
* inconclusive (e.g. `ps` unavailable), never as a substitute for it.
*/
function probeMultiplexer(exec, env, opts = {}) {
	const prefix = opts.envPrefix ?? "CYBER_MUX";
	const override = env[prefix];
	const pane = env[`${prefix}_PANE`];
	if (isKnownMux(override)) return {
		mux: override,
		...pane ? { pane } : {},
		via: "env"
	};
	if (opts.discover === false) return {
		mux: "none",
		via: "ancestry"
	};
	return discoverByAncestry(exec, env);
}
const MUX_COMM = [
	{
		re: /^tmux(:|$)/,
		mux: "tmux"
	},
	{
		re: /^herdr(:|$)/,
		mux: "herdr"
	},
	{
		re: /^wezterm(-gui|-mux-server)?(:|$)/,
		mux: "wezterm"
	},
	{
		re: /^zellij(:|$)/,
		mux: "zellij"
	},
	{
		re: /^screen(:|$)/,
		mux: "screen"
	}
];
/** The per-pane env var for a mux, via the shared `PANE_ENV` table; undefined for screen/none. */
function paneFor(mux, env) {
	return mux === "tmux" || mux === "herdr" || mux === "wezterm" || mux === "zellij" || mux === "cmux" ? PANE_ENV[mux](env) : void 0;
}
/**
* An ancestry-discovered probe, OMITTING `pane` when the mux carries none — never carrying it as an
* explicit `undefined`, so `MuxProbe.pane` stays an absent-or-present field (the same conditional
* shape the `$CYBER_MUX_PANE` fast-path uses above).
*/
function ancestryProbe(mux, env) {
	const pane = paneFor(mux, env);
	return {
		mux,
		...pane !== void 0 ? { pane } : {},
		via: "ancestry"
	};
}
const MAX_ANCESTORS = 32;
function walkAncestry(exec, env) {
	let pid = process.pid;
	const seen = /* @__PURE__ */ new Set();
	for (let i = 0; i < MAX_ANCESTORS; i++) {
		if (seen.has(pid)) break;
		seen.add(pid);
		const line = exec("ps", [
			"-o",
			"ppid=,comm=",
			"-p",
			String(pid)
		]);
		if (!line) break;
		const trimmed = line.trim();
		const spaceIdx = trimmed.indexOf(" ");
		const ppidStr = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
		const comm = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
		const ppid = Number.parseInt(ppidStr, 10);
		for (const entry of MUX_COMM) if (entry.re.test(comm)) return ancestryProbe(entry.mux, env);
		if (!Number.isFinite(ppid) || ppid <= 1) break;
		pid = ppid;
	}
}
function discoverByAncestry(exec, env) {
	const found = walkAncestry(exec, env);
	if (found) return found;
	if (env["TMUX"]) return ancestryProbe("tmux", env);
	if (env["HERDR_ENV"]) return ancestryProbe("herdr", env);
	if (env["WEZTERM_PANE"]) return ancestryProbe("wezterm", env);
	if (env["ZELLIJ"]) return ancestryProbe("zellij", env);
	if (env["CMUX_WORKSPACE_ID"]) return ancestryProbe("cmux", env);
	if (env["OTTY_PANE_ID"]) return ancestryProbe("otty", env);
	return {
		mux: "none",
		via: "ancestry"
	};
}
/** Max flush re-submits after the initial submit, before nudge fails loud. */
const DEFAULT_ATTEMPTS = 10;
/** Wait after a submit before reading the pane back, in ms. */
const DEFAULT_SETTLE_MS = 400;
/** Length of the message prefix used as the staged-text needle. */
const NEEDLE_LEN = 40;
/**
* Whether `message` is still sitting staged in `visible`'s input box (not yet submitted). A real
* submit scrolls the message into the transcript, leaving the bottom input box empty, so the
* needle is absent from the tail; while staged it sits in the bottom input box, so the needle is
* present. `visible` being null/empty means the turn can't be confirmed — treated as still staged
* so callers keep retrying rather than falsely reporting success.
*/
function isStaged(visible, message) {
	if (!visible) return true;
	const needle = message.replace(/\s+/g, " ").trim().slice(0, NEEDLE_LEN);
	if (needle === "") return true;
	return visible.split("\n").filter((l) => l.trim() !== "").slice(-5).join(" ").replace(/\s+/g, " ").trim().includes(needle);
}
/**
* Submit `message` to `target` and verify the peer actually took the turn — a booting harness can
* swallow the Enter of the initial `submit`, leaving the text staged unsent while nudge would
* otherwise report false success. Types the message exactly once; a swallowed Enter is recovered by
* flushing the staged buffer (`adapter.submit` with no text, a bare Enter) — never re-typing the
* message — up to a bounded number of attempts. Throws if the turn is never taken within the cap.
*
* A pane that no longer exists is rejected up front rather than retried: a gone pane and a booting
* one both read back empty, so without the liveness probe the retry loop reports a dead peer as
* "never took the turn" — a boot-race shape — and buries the real cause.
*
* **Not built on `waitForOutput`, deliberately.** The two look alike and wait on opposite conditions:
* `waitForOutput` returns when a pattern APPEARS anywhere in the snapshot, while nudge returns when the
* message DISAPPEARS from the input box at the bottom (`isStaged`) — a negative, position-sensitive
* condition the wait primitive cannot express, and one that must not be satisfied by the same text
* sitting up in the transcript, which is exactly where a submitted message ends up. Nor is the loop body
* the same: nudge does not merely observe between polls, it re-submits, so its "poll" is a corrective
* action with its own attempt budget rather than a read. What the two DO share is the liveness rule —
* a gone pane throws instead of being reported as a quiet one — and `pollForOutput` adopts it from here.
*/
async function nudge(adapter, exec, target, message, opts = {}) {
	const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
	const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;
	const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	if (!adapter.paneExists(exec, target)) throw new Error(`nudge failed: pane ${target.id} no longer exists — the peer's session is gone, not busy.`);
	adapter.submit(exec, target, message);
	await sleep(settleMs);
	if (!isStaged(adapter.read(exec, target).text, message)) return {
		taken: true,
		resubmits: 0
	};
	for (let attempt = 1; attempt <= attempts; attempt++) {
		adapter.submit(exec, target);
		await sleep(settleMs);
		if (!isStaged(adapter.read(exec, target).text, message)) return {
			taken: true,
			resubmits: attempt
		};
	}
	throw new Error(`nudge failed: peer at pane ${target.id} never took the turn — input still staged after ${attempts} re-submit attempts`);
}
/**
* This process's own pane, as something `adapter` can address — `MuxOpenOptions.from`'s intended
* argument for a `pane:*` open, so a split lands on the caller rather than on whichever pane the
* user is looking at (see `from`'s note for why each backend's default gets that wrong).
*
* `undefined` when this session is in no pane, or in a pane belonging to a *different* multiplexer
* than `adapter` drives — that mismatch is reachable (a `$TMUX_PANE` inherited into a herdr pane,
* `$CYBER_MUX` overridden to the other backend), and handing one backend the other's pane id would
* turn a self-identity mixup into a split of some unrelated pane. Falling back to the backend's own
* default is the conservative answer: still possibly the wrong pane, but never a foreign id.
*
* A `MuxSession` exposes this bound as `mux.callerPane()`; this free form is for the raw seam.
*/
function callerPane(adapter, env) {
	const self = currentPane(env);
	return self && self.mux === adapter.name ? { id: self.pane } : void 0;
}
//#endregion
//#region src/admin.ts
/**
* Merge one store's registry + mailboxes + briefs into another (skip agent ids already present at
* the destination). Used by `admin migrate` when moving state between an old project-local root
* and the new global hub. Best-effort: it re-files every message into the destination's unread
* set — the source's own read/unread split is not preserved across a migrate.
*/
function migrateStore(from, to) {
	let agents = 0;
	let messages = 0;
	let briefs = 0;
	to.ensureMarker();
	for (const rec of from.listAgents()) {
		if (!to.getAgent(rec.id)) {
			to.putAgent(rec);
			agents++;
		}
		const snap = from.listInbox(rec.id);
		for (const msg of [...snap.unread, ...snap.read]) {
			to.putMessage(rec.id, msg);
			messages++;
		}
		const brief = from.readBrief(rec.id);
		if (brief != null) {
			to.writeBrief(rec.id, brief);
			briefs++;
		}
	}
	return {
		agents,
		messages,
		briefs
	};
}
//#endregion
//#region src/paths.ts
/** The tracked marker file that makes a hub root initialized (see ensureMarker). */
const MARKER_FILE = "config.json";
/** Walk up from `cwd` to the nearest git repo root; fall back to `cwd`. */
function projectRoot(cwd = process.cwd()) {
	let dir = resolve(cwd);
	for (;;) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return resolve(cwd);
		dir = parent;
	}
}
/**
* Resolve the cyberlegion hub root. Precedence: explicit --root/--space, then `$CYBERLEGION_ROOT`,
* then the GLOBAL hub `~/.agents/cyberlegion` (addressable across every project and worktree
* boundary — identity/mail/registry state lives here by default; `--space` isolates it), falling
* back to a project-local `.agents/cyberlegion` only when no home directory is resolvable.
*/
function resolveRoot(opts = {}) {
	const env = opts.env ?? process.env;
	const explicit = opts.root ?? opts.space ?? env.CYBERLEGION_ROOT;
	if (explicit) return resolve(explicit);
	const home = homedir();
	if (home) return join(home, ".agents", "cyberlegion");
	return join(projectRoot(opts.cwd), ".agents", "cyberlegion");
}
/**
* Create the tracked `config.json` marker at `root` (a hub root) if it does not already exist.
* Callers pass the root under which the marker should be created/ensured; this mkdir's it as
* needed. Idempotent — never overwrites an existing marker.
*/
function ensureMarker(root) {
	mkdirSync(root, { recursive: true });
	const marker = join(root, MARKER_FILE);
	if (!existsSync(marker)) writeFileSync(marker, `${JSON.stringify({ version: 1 }, null, 2)}\n`);
}
/**
* Thrown when an agent/message id destined to become a filename PATH SEGMENT fails
* `assertSafeId` — see that function's doc for why this rejects rather than encodes.
*/
var InvalidIdError = class extends Error {
	kind;
	value;
	constructor(kind, value) {
		super(`invalid ${kind} ${JSON.stringify(value)} — must not be empty, ".", "..", or contain a path separator`);
		this.kind = kind;
		this.value = value;
		this.name = "InvalidIdError";
	}
};
const UNSAFE_ID = /[\\/\0]/;
/**
* Filename-safety guard for any id that becomes a bare PATH SEGMENT under the hub root — agent ids
* (`agentFile`/`inboxDir`/`dataDir`/`briefFile`) and message ids (`messageFile`). Both are
* effectively user/peer-controlled: an agent id round-trips a caller-supplied `--handle`-adjacent
* value in some flows, and nothing upstream of the store validates it before it reaches a `join()`.
*
* REJECT, don't encode: unlike `sanitizePane` (which deliberately encodes, because a tmux/herdr pane
* locator is an opaque, internally-produced token that only needs to survive as a *lookup key*, not
* round-trip as an identity), an agent/message id is a PRIMARY KEY — `getAgent(id)` must return
* exactly what `putAgent` stored under that same `id`. Silently encoding two different malformed ids
* onto the same sanitized filename would let one caller's write silently clobber or read another's
* record — a worse failure than a loud, immediate refusal. So: empty, `.`, `..`, and any embedded
* path separator (POSIX `/`, Windows `\`) or NUL byte are rejected outright, which also rejects an
* absolute path outright (an absolute path always contains a separator).
*/
function assertSafeId(id, kind) {
	if (!id || id === "." || id === ".." || UNSAFE_ID.test(id)) throw new InvalidIdError(kind, id);
	return id;
}
const paths = {
	agentsDir: (root) => join(root, "agents"),
	agentFile: (root, id) => join(root, "agents", `${assertSafeId(id, "agent id")}.json`),
	panesDir: (root) => join(root, "panes"),
	paneFile: (root, pane) => join(root, "panes", `${sanitizePane(pane)}.id`),
	inboxDir: (root, id) => join(root, "inbox", assertSafeId(id, "agent id")),
	inboxReadDir: (root, id) => join(root, "inbox", assertSafeId(id, "agent id"), "read"),
	dataDir: (root, id) => join(root, "data", assertSafeId(id, "agent id")),
	briefFile: (root, id) => join(root, "data", assertSafeId(id, "agent id"), "brief.md"),
	mainPaneFile: (root) => join(root, "main-pane.id"),
	projectsDir: (root) => join(root, "projects"),
	serviceLeaseFile: (root, project, service) => join(root, "services", assertSafeId(project, "project id"), `${assertSafeId(service, "service name")}.json`),
	projectFile: (root, id) => join(root, "projects", `${assertSafeId(id, "project id")}.json`),
	/** A message's file path within `toId`'s unread/read inbox dir, keyed by its own collision-free
	* id — validated the same as an agent id (it's the same class of risk: a peer- or CLI-controlled
	* string becoming a filename). */
	messageFile: (root, toId, msgId) => join(paths.inboxDir(root, toId), `${assertSafeId(msgId, "message id")}.json`),
	messageReadFile: (root, toId, msgId) => join(paths.inboxReadDir(root, toId), `${assertSafeId(msgId, "message id")}.json`)
};
/**
* Where a spawned unit's own git worktree is checked out by default — a sibling of the primary
* checkout (`<parent>/<repo>.worktrees/legion-<id>`), never nested inside the primary's own working
* tree. A linked worktree living inside the primary's tree is untracked-but-present: it pollutes
* `git status` in the primary checkout, confuses tooling that walks the tree recursively (test
* runners, watchers, `find`/`rm -rf`), and risks a tree-wide op in the primary crossing into the
* nested worktree's own checkout. `<repo>.worktrees/` matches the sibling convention already in use
* for other tools' worktrees in this environment (herdr's `worktree-<word>-<word>-<hash>`, cursor's
* `<proj><count>`); the `legion-` prefix self-identifies this tool's own units the same way, without
* needing a subfolder.
*/
function resolveUnitWorktreePath(primaryRoot, id) {
	return join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`, `legion-${id}`);
}
/** tmux pane ids look like "%3"; make them filesystem-safe. */
function sanitizePane(pane) {
	return pane.replace(/[^A-Za-z0-9_-]/g, "_");
}
//#endregion
//#region src/mux-env.ts
/**
* Transitional env-normalization seam (mux.feature: "a pane carrying only the legacy fast-path vars
* is still honored"). cyber-mux's own fast-path reads `$CYBER_MUX`/`$CYBER_MUX_PANE` — its
* `currentPane` hardcodes those names (no `envPrefix` override), and `probeMultiplexer`'s `envPrefix`
* option renames the WHOLE pair together, so neither can be steered to fall back onto a
* differently-named legacy pair. Every call into cyber-mux that reads the fast-path
* (`probeMultiplexer`, `currentPane`, `callerPane`, `resolveMuxAdapter`) must be handed this seam's
* output instead of the raw env.
*
* When `$CYBER_MUX`/`$CYBER_MUX_PANE` are both absent and either legacy `$CYBERLEGION_MUX`/
* `$CYBERLEGION_MUX_PANE` var is present, copies the legacy pair onto the current names. Never
* overwrites an already-set current var — the current pair always wins outright the moment either
* half of it is set, exactly matching the frozen precedence chain (mux.feature: "the current
* fast-path vars win over the legacy pair when both are set").
*
* Transitional — deleted once no pre-migration pane (one that only ever exported the legacy pair) is
* still alive.
*/
function normalizeMuxEnv(env) {
	const hasCurrent = env.CYBER_MUX !== void 0 || env.CYBER_MUX_PANE !== void 0;
	const hasLegacy = env.CYBERLEGION_MUX !== void 0 || env.CYBERLEGION_MUX_PANE !== void 0;
	if (hasCurrent || !hasLegacy) return env;
	return {
		...env,
		CYBER_MUX: env.CYBERLEGION_MUX,
		CYBER_MUX_PANE: env.CYBERLEGION_MUX_PANE
	};
}
//#endregion
//#region src/identity.ts
const realExec = nodeExec;
/** `currentPane`, narrowed to a backend the registry can actually store a locator under. A caller
* inside a pane-carrying-but-unstorable multiplexer (wezterm/zellij) is simply unpaned here — it can
* still resolve an identity via the `$CYBERLEGION_AGENT_ID` env fallback, it just cannot bind a pane
* locator to it. */
function storablePane(env) {
	const cur = currentPane(normalizeMuxEnv(env));
	return cur && (cur.mux === "tmux" || cur.mux === "herdr") ? {
		mux: cur.mux,
		pane: cur.pane
	} : void 0;
}
const nowIso = (ctx) => new Date(ctx.now?.() ?? Date.now()).toISOString();
function randomId() {
	return randomBytes(8).toString("hex");
}
function loadAgent(store, id) {
	return store.getAgent(id);
}
function saveAgent(store, rec) {
	store.putAgent(rec);
}
function listAgents(store) {
	return store.listAgents();
}
/** Detect the harness: explicit wins, then env probes, then the tmux pane command. */
function detectHarness(explicit, ctx) {
	if (explicit) {
		if (explicit === "claude" || explicit === "cursor" || explicit === "codex") return explicit;
		throw new Error(`unknown --harness "${explicit}" (expected claude | cursor | codex)`);
	}
	const env = ctx.env ?? process.env;
	if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "claude";
	if (Object.keys(env).some((k) => k.startsWith("CURSOR"))) return "cursor";
	if (Object.keys(env).some((k) => k.startsWith("CODEX"))) return "codex";
	const pane = env.TMUX_PANE;
	if (pane) {
		const cmd = (ctx.exec ?? realExec)("tmux", [
			"display-message",
			"-p",
			"-t",
			pane,
			"#{pane_current_command}"
		]);
		if (cmd?.includes("cursor")) return "cursor";
		if (cmd?.includes("codex")) return "codex";
		if (cmd?.includes("claude")) return "claude";
	}
}
/**
* Recover the calling agent's own id, mux-agnostically. Inside any multiplexer pane (tmux or herdr)
* the pane index is authoritative — a pane with no pane entry is simply unregistered and must NOT
* adopt `$CYBERLEGION_AGENT_ID` (that env fallback applies ONLY when the session is in no
* multiplexer pane at all). There is no shared bare "self" file — self-id is always pane-keyed or
* explicit via the env var.
*/
function resolveSelfId(ctx) {
	const env = ctx.env ?? process.env;
	const cur = currentPane(normalizeMuxEnv(env));
	if (cur) return ctx.store.resolvePaneId(cur.pane);
	return env.CYBERLEGION_AGENT_ID || void 0;
}
/** Register (or idempotently refresh) this session's identity. */
function register(ctx, input) {
	ctx.store.ensureMarker();
	const env = ctx.env ?? process.env;
	const harness = detectHarness(input.harness, ctx);
	if (!harness) throw new Error("could not detect harness — pass --harness claude|cursor|codex");
	const existingId = resolveSelfId(ctx);
	const existing = existingId ? loadAgent(ctx.store, existingId) : void 0;
	const id = existing?.id ?? existingId ?? randomId();
	const ts = nowIso(ctx);
	const cur = storablePane(env);
	const exec = ctx.exec ?? realExec;
	const rec = {
		id,
		handle: input.handle ?? existing?.handle ?? id.slice(0, 6),
		harness,
		cwd: process.cwd(),
		worktree: existing?.worktree ?? gitWorktree(exec),
		pane: cur ? paneLocator(cur, exec, env) : null,
		status: "active",
		createdAt: existing?.createdAt ?? ts,
		lastSeen: ts,
		...existing?.brief ? { brief: existing.brief } : {},
		...existing?.spawnedBy ? { spawnedBy: existing.spawnedBy } : {}
	};
	saveAgent(ctx.store, rec);
	if (cur) ctx.store.putPaneIndex(cur.pane, id);
	return rec;
}
/** Build the record's pane locator. `window`/`session` are tmux-only (herdr's pane id is
* self-contained and its CLI needs nothing more to address a pane). */
function paneLocator(cur, exec, env) {
	if (cur.mux === "tmux") return {
		mux: "tmux",
		id: cur.pane,
		window: exec("tmux", [
			"display-message",
			"-p",
			"-t",
			cur.pane,
			"#{window_id}"
		]) ?? void 0,
		session: env.TMUX?.split(",")[0]
	};
	return {
		mux: cur.mux,
		id: cur.pane
	};
}
/** Derive a standing record's stable id from its handle — same slug rule as `sanitizePane`, prefixed
* so it reads distinct from a random 16-hex session id or a pane pointer. */
function standingId(handle) {
	return `standing-${sanitizePane(handle)}`;
}
/**
* Mint (or idempotently refresh) a standing identity: a session-independent, prune-exempt owner
* inbox keyed by handle, with no pane/tmux/harness. A SIBLING of `register`, not an overload — it
* skips all pane/tmux machinery and harness auto-detection entirely.
*/
function registerStanding(ctx, input) {
	ctx.store.ensureMarker();
	const id = standingId(input.handle);
	const existing = loadAgent(ctx.store, id);
	const ts = nowIso(ctx);
	const rec = {
		id,
		handle: input.handle,
		kind: "standing",
		pane: null,
		harness: void 0,
		cwd: process.cwd(),
		status: "active",
		createdAt: existing?.createdAt ?? ts,
		lastSeen: ts
	};
	saveAgent(ctx.store, rec);
	return rec;
}
function gitWorktree(exec) {
	const root = exec("git", ["rev-parse", "--show-toplevel"]);
	if (!root) return null;
	return {
		root,
		branch: exec("git", [
			"rev-parse",
			"--abbrev-ref",
			"HEAD"
		]) ?? void 0
	};
}
/** Prefer a standing record over a plain session record when both match a handle — an owner
* report must land in the durable standing inbox, not a dying session's. */
function preferStanding(matches) {
	return matches.find((a) => a.kind === "standing") ?? matches[0];
}
/** Split a handle's matches into live and exited. An exited unit's pane is gone and its inbox has
* no reader, so a *name* must never resolve to one — a handle is reusable across units, and the
* dead holders of it outnumber the live one over time. Standing records never exit. An explicit id
* still resolves either way: naming a unit outright is a deliberate choice, unlike reaching for a
* handle and silently landing on a corpse. */
function matchHandle(agents, handle) {
	const matched = agents.filter((a) => a.handle === handle);
	return {
		live: matched.filter((a) => a.status !== "exited"),
		exited: matched.filter((a) => a.status === "exited")
	};
}
/** Fail loudly when a handle names only the dead — never fall through to a corpse. */
function unaddressable(ref, exited, tried) {
	if (exited.length > 0) {
		const dead = exited.map((a) => `${a.id.slice(0, 6)}${a.pane ? ` (${a.pane.id})` : ""}`).join(", ");
		return /* @__PURE__ */ new Error(`"${ref}" matches only exited unit(s) — ${dead} — which have no reader. Address a live unit ('cyberlegion unit who'), or run 'cyberlegion unit register --standing --handle ${ref}' for a durable inbox.`);
	}
	return /* @__PURE__ */ new Error(`no agent addressable as "${ref}" (tried ${tried})`);
}
/** Resolve a handle to its standing owner record's id — never falls back to a live session agent
* sharing that handle, so `--owner` can never be pointed at a session's inbox by mistake. */
function resolveStandingOwner(store, handle) {
	const match = listAgents(store).find((a) => a.handle === handle && a.kind === "standing");
	if (!match) throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`);
	return match.id;
}
/**
* Resolve an `--owner` mailbox reference: a standing owner by handle, or a service endpoint by id or
* by its handle when exactly one carries it. Never a session's own inbox.
*/
function resolveOwnerMailbox(store, ref) {
	const byId = loadAgent(store, ref);
	if (byId?.kind === "service" || byId?.kind === "standing") return byId.id;
	const agents = listAgents(store);
	if (agents.some((a) => a.handle === ref && a.kind === "standing")) return resolveStandingOwner(store, ref);
	const services = agents.filter((a) => a.handle === ref && a.kind === "service");
	if (services.length === 1) return services[0].id;
	if (services.length > 1) throw new Error(`"${ref}" names ${services.length} service endpoints — pass an endpoint id (${services.map((a) => a.id).join(", ")})`);
	return resolveStandingOwner(store, ref);
}
/**
* Bind the caller's own unit as a standing owner's presence — the live unit standing in for a
* durable record that has no session of its own. Order matters: resolve the standing record first
* (an unknown handle throws via `resolveStandingOwner` — fail-loud, never auto-mints), THEN gate on
* spawn capability, THEN resolve the caller's own id — so an unknown handle or a caller with no
* multiplexer never touches the pointer. Last claim wins: a plain overwrite, no merge.
*/
function claimPresence(ctx, handle) {
	const standingId = resolveStandingOwner(ctx.store, handle);
	if (!loadAgent(ctx.store, standingId)) throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`);
	if (probeMultiplexer(ctx.exec ?? realExec, normalizeMuxEnv(ctx.env ?? process.env)).mux === "none") throw new Error("claiming a presence needs a multiplexer to open panes");
	const selfId = resolveSelfId(ctx);
	if (!selfId) throw new Error("no identity in this session — run `cyberlegion unit register` first");
	return ctx.store.withLock(`presence:${standingId}`, () => {
		const rec = loadAgent(ctx.store, standingId);
		if (!rec) throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`);
		rec.presence = selfId;
		saveAgent(ctx.store, rec);
		return rec;
	});
}
/**
* Unbind a standing owner's presence. The unknown-handle throw (via `resolveStandingOwner`) wins
* over this call's own tolerance: `--clear` is forgiving about *nothing being bound* (a no-op, never
* an error), never about *the owner not existing* — a typo'd handle fails loudly instead of silently
* reporting a clear it never performed.
*/
function clearPresence(ctx, handle) {
	const standingId = resolveStandingOwner(ctx.store, handle);
	if (!loadAgent(ctx.store, standingId)) throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`);
	return ctx.store.withLock(`presence:${standingId}`, () => {
		const rec = loadAgent(ctx.store, standingId);
		if (!rec) throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`);
		if (rec.presence !== void 0) {
			rec.presence = void 0;
			saveAgent(ctx.store, rec);
		}
		return rec;
	});
}
/**
* The live-only presence rule, keyed off a standing record the caller ALREADY HOLDS — the pointer
* records a unit id, and that unit can exit while the standing record it stands in for never does,
* so a presence whose unit is missing or `status: exited` reads as no presence bound, exactly as if
* none were ever claimed. Nothing here self-heals the stale pointer; it stays inert until re-claimed
* via `claimPresence`.
*
* Separate from `resolvePresence` because this one is INCAPABLE of throwing: the delivery doorbell
* must never fail a send that already landed durably, so it cannot resolve the presence through a
* handle-resolving path that throws when the standing record races away underneath it (a concurrent
* `unit close`/`decommission` between loading the recipient and reading its presence). It is also
* strictly cheaper — no O(n) registry scan to re-find a record the caller is holding.
*/
function presenceOf(store, rec) {
	if (!rec.presence) return void 0;
	const presenceUnit = loadAgent(store, rec.presence);
	if (!presenceUnit || presenceUnit.status === "exited") return void 0;
	return presenceUnit;
}
/**
* Resolve a standing owner's presence by handle, live-only (`presenceOf`). The handle-keyed front
* door for the CLI read path: it keeps the fail-loud unknown-handle throw (via `resolveStandingOwner`)
* so `unit claim <handle> --show` on a typo'd handle errors rather than reporting a definitive `none`
* for an owner that does not exist.
*/
function resolvePresence(store, handle) {
	const rec = loadAgent(store, resolveStandingOwner(store, handle));
	if (!rec) return void 0;
	return presenceOf(store, rec);
}
/** Resolve a recipient argument (id or handle) to an agent id. A handle resolves to live units
* only — mail addressed to an exited unit lands in an inbox nobody reads. */
function resolveRecipient(store, to) {
	if (loadAgent(store, to)) return to;
	const { live, exited } = matchHandle(listAgents(store), to);
	const match = preferStanding(live);
	if (!match) throw unaddressable(to, exited, "id and handle");
	return match.id;
}
/**
* Resolve a unit reference by id, handle, or its worktree branch (the unit↔CR join key: an
* `AgentRecord.worktree.branch` equals the SDD `<cr-ref>` it maps to, when spawned for one). Used
* by verbs that address "the unit working on CR X" as well as "the unit named X".
*/
function resolveAgent(store, ref) {
	const byId = loadAgent(store, ref);
	if (byId) return byId;
	const agents = listAgents(store);
	const { live, exited } = matchHandle(agents, ref);
	const byHandle = preferStanding(live);
	if (byHandle) return byHandle;
	const byBranchAll = agents.filter((a) => a.worktree?.branch === ref);
	const byBranch = byBranchAll.find((a) => a.status !== "exited");
	if (byBranch) return byBranch;
	throw unaddressable(ref, [...exited, ...byBranchAll.filter((a) => a.status === "exited")].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i), "id, handle, and worktree branch/CR");
}
function bumpLastSeen(ctx, id) {
	const rec = loadAgent(ctx.store, id);
	if (!rec) return;
	rec.lastSeen = nowIso(ctx);
	saveAgent(ctx.store, rec);
}
/** Refresh this session's own last-seen if it is registered — best-effort, never throws. */
function touch(ctx) {
	const id = resolveSelfId(ctx);
	if (id) bumpLastSeen(ctx, id);
}
const STALE_MS = 9e5;
/** Standing and service records have no session of their own, so nothing about a pane or a timer
* can declare them dead. */
function isSessionIndependent(rec) {
	return rec.kind === "standing" || rec.kind === "service";
}
/**
* Whether a unit's session is still there, as far as its backend can tell. "Cannot rule out alive"
* must never become grounds to replace an owner — the same fail-closed policy `store/lock.ts` takes
* on an ambiguous holder — so a session reads as gone only on positive evidence: its multiplexer
* answered with a pane list and the pane is not in it. A record with no pane cannot be probed, and a
* backend the caller cannot reach (a different server, no client, a failed query) answers with
* nothing; both read as live. `paneExists` is not used here because it collapses "unreachable" into
* "gone". An exited record is never live.
*/
function sessionLive(ctx, rec) {
	if (rec.status === "exited") return false;
	if (!rec.pane) return true;
	const panes = PANE_ADAPTERS[rec.pane.mux].listPanes(ctx.exec ?? realExec);
	if (panes.length === 0) return true;
	const id = rec.pane.id;
	return panes.some((p) => p.id === id);
}
/** The per-mux session adapters `prune` consults for pane liveness — each answers with its own
* backend primitive so a herdr pane is never probed with a tmux query, and vice versa. */
const PANE_ADAPTERS = {
	tmux: tmuxMuxAdapter,
	herdr: herdrMuxAdapter
};
/** Map a backend-reported agent string to a known harness — substring-matched like the tmux
* pane-command probe in `detectHarness`; anything else is unclassifiable. */
function harnessFromAgent(agent) {
	if (!agent) return void 0;
	if (agent.includes("cursor")) return "cursor";
	if (agent.includes("codex")) return "codex";
	if (agent.includes("claude")) return "claude";
}
/**
* Adopt half of reconcile-against-mux: mint a record for each live pane with a detectable harness
* and no matching record — bind pane→id, handle from the pane's reported cwd basename (sanitized;
* `id.slice(0, 6)` when the backend reports no cwd), status active, lastSeen now. A pane is bound —
* and never adopted — when its pane index resolves to an existing record or any record (any status,
* exited included) bears it; resurrecting an exited record is the in-pane session's own `register`
* via the pane pointer, never reconcile's. tmux panes carry no harness signal, so only herdr panes
* are adoptable today.
*/
function adopt(ctx, panes) {
	const agents = listAgents(ctx.store);
	const adopted = [];
	for (const pane of panes) {
		if (pane.mux !== "tmux" && pane.mux !== "herdr") continue;
		const harness = harnessFromAgent(pane.harness);
		if (!harness) continue;
		const boundId = ctx.store.resolvePaneId(pane.id);
		if (boundId && loadAgent(ctx.store, boundId)) continue;
		if (agents.some((a) => a.pane?.mux === pane.mux && a.pane.id === pane.id)) continue;
		const id = randomId();
		const ts = nowIso(ctx);
		const rec = {
			id,
			handle: pane.cwd ? sanitizePane(basename(pane.cwd)) : id.slice(0, 6),
			harness,
			cwd: pane.cwd ?? "",
			pane: {
				mux: pane.mux,
				id: pane.id
			},
			status: "active",
			createdAt: ts,
			lastSeen: ts
		};
		saveAgent(ctx.store, rec);
		ctx.store.putPaneIndex(pane.id, id);
		adopted.push(rec);
	}
	return adopted;
}
/**
* Cull dead records against the current mux's live pane set (the mux the caller is actually inside,
* per `currentPane`) — mux-scoped: it never declares the *other* mux's records dead, since it can't
* enumerate them. Standing records are exempt; a `pane: null` record can't be pane-culled by
* enumeration (left to `prune`'s staleness timer). Outside any multiplexer pane there is nothing to
* enumerate, so it culls nothing. With `adopt` set (the `who --reconcile` path — `prune` stays
* cull-only), the same live set also feeds adoption of unbound harness-bearing panes.
*/
function reconcile(ctx, opts) {
	const exec = ctx.exec ?? realExec;
	const cur = storablePane(ctx.env ?? process.env);
	if (!cur) return [];
	const panes = PANE_ADAPTERS[cur.mux].listPanes(exec);
	const live = new Set(panes.map((p) => p.id));
	const changed = [];
	for (const rec of listAgents(ctx.store)) {
		if (isSessionIndependent(rec)) continue;
		if (rec.status === "exited") continue;
		if (!rec.pane) continue;
		if (rec.pane.mux !== cur.mux) continue;
		if (!live.has(rec.pane.id)) {
			rec.status = "exited";
			saveAgent(ctx.store, rec);
			changed.push(rec);
		}
	}
	if (opts?.adopt) changed.push(...adopt(ctx, panes));
	return changed;
}
/** Mark agents whose pane is gone or whose last-seen is stale as exited. Reconcile-culls against the
* current mux's live set first, then falls through to the per-record paneExists + staleness check
* (covers the other mux and sessions outside any multiplexer pane). */
function prune(ctx) {
	const exec = ctx.exec ?? realExec;
	const now = ctx.now?.() ?? Date.now();
	const changed = reconcile(ctx);
	for (const rec of listAgents(ctx.store)) {
		if (isSessionIndependent(rec)) continue;
		if (rec.status === "exited") continue;
		const paneGone = rec.pane ? !PANE_ADAPTERS[rec.pane.mux].paneExists(exec, { id: rec.pane.id }) : false;
		const stale = now - new Date(rec.lastSeen).getTime() > STALE_MS;
		if (paneGone || stale) {
			rec.status = "exited";
			saveAgent(ctx.store, rec);
			changed.push(rec);
		}
	}
	return changed;
}
//#endregion
//#region src/console/doorbell.ts
/** The doorbell text delivered to a woken recipient; also the standalone `unit nudge` default. */
const DELIVERY_DOORBELL = "You have unread mail — check your inbox.";
/**
* The first-turn doorbell `unit spawn` delivers to a freshly-opened paned peer — the instruction
* itself, not a notification that context is already populated. It names the brief's **file path**
* and tells the peer to read it and begin, so pickup does not depend on a SessionStart hook firing
* in the child (superseding ADR-0027, which split payload-delivery from turn-delivery).
*
* The path is named, never the brief's body: the brief is still written to its file and still never
* typed into the pane, so a long brief costs one line here however large it is, and a re-submit on
* the boot race re-types this instruction rather than the payload.
*/
function spawnDoorbell(briefPath) {
	return `Read your brief at ${briefPath}, then begin work.`;
}
/**
* A freshly-launched harness cold-boots slower than an already-running peer, so the spawn first-turn
* ring gets a wider retry budget than a plain `mail send` doorbell (nudge's own 10 × 400ms): flush the
* staged buffer for up to ~8s (20 × 400ms) before giving up. The common case still returns after one
* settle cycle once the peer takes the turn — the budget only bounds a slow or stuck boot. Still
* bounded — a harness that never reaches its prompt resolves to a best-effort warning, never a hang.
*/
const SPAWN_NUDGE_OPTS = {
	attempts: 20,
	settleMs: 400
};
/** Resolve an agent's live session pane: its recorded pane, else a pane pointer keyed by its id. */
function paneOf(store, id) {
	return loadAgent(store, id)?.pane?.id ?? store.findPaneByAgentId(id);
}
/**
* Best-effort wake the recipient of a just-delivered message so it checks its inbox. A peer's live
* session pane, a standing owner's bound presence (`unit claim` — the live unit standing in for it,
* an exited one falling back below), or — with neither — the hub's bound main pane, is rung via the
* nudge submit-verify path (a taken turn, not fire-and-forget). Durable delivery already happened;
* the ring is opportunistic on top, so a legitimate no-op (`--no-nudge`, a headless/absent recipient
* with no live pane, a standing-owner send with no presence and no main pane bound, or a
* self-addressed send) rings nothing, and a ring that never completes within nudge's retry cap is
* swallowed into a warning. This never throws — it can never fail the send.
*
* The adapter is resolved lazily via `getAdapter`, invoked only once a pane to ring is confirmed and
* inside the same swallowing try — so a session with no mux backend (where `selectSessionAdapter`
* throws) is just a no-op wake, never a failed send.
*/
async function wakeRecipient(store, getAdapter, exec, input, nudgeOpts) {
	if (input.noNudge) return { rung: false };
	const recipient = loadAgent(store, input.toId);
	if (!recipient) return { rung: false };
	let pane;
	let focusGated = false;
	if (recipient.kind === "standing") {
		const presenceUnit = presenceOf(store, recipient);
		if (presenceUnit) pane = paneOf(store, presenceUnit.id);
		else {
			pane = store.getMainPane();
			focusGated = true;
		}
	} else pane = paneOf(store, recipient.id);
	if (!pane) return { rung: false };
	if (pane === paneOf(store, input.fromId)) return { rung: false };
	if (focusGated) {
		let focused;
		try {
			focused = getAdapter().isPaneFocused(exec, { id: pane });
		} catch {
			focused = void 0;
		}
		if (focused === false) return {
			rung: false,
			pane
		};
	}
	try {
		await nudge(getAdapter(), exec, { id: pane }, DELIVERY_DOORBELL, nudgeOpts);
		return {
			rung: true,
			pane
		};
	} catch (err) {
		return {
			rung: false,
			pane,
			warning: err instanceof Error ? err.message : String(err)
		};
	}
}
/**
* Best-effort deliver a freshly-spawned paned peer's first turn so it acts on its brief with no
* human nudge. A paned agent boots to an idle prompt — the brief sits unread on disk and the model
* takes no turn on its own, unlike a subagent (where the caller's Task call IS the turn). So `unit
* spawn` rings the instruction (`spawnDoorbell`, naming the brief's file path) over the
* boot-race-aware `nudge` submit-verify path (a taken turn, never typing the brief itself), the same
* best-effort ring `wakeRecipient` gives `mail send`: the spawn (worktree, session, registry record)
* is the guaranteed effect and the ring is opportunistic on top, so `--no-wake` rings nothing and a
* ring that never completes within the retry budget is swallowed into a warning. This never throws —
* it can never fail the spawn.
*
* The adapter is resolved lazily via `getAdapter` inside the same swallowing try, so even a session
* whose backend has since gone away (where `selectSessionAdapter` would throw) degrades to a warned
* no-op rather than a failed spawn.
*/
async function wakeSpawn(getAdapter, exec, input, nudgeOpts = SPAWN_NUDGE_OPTS) {
	if (input.noWake) return { rung: false };
	try {
		await nudge(getAdapter(), exec, input.target, spawnDoorbell(input.briefPath), nudgeOpts);
		return {
			rung: true,
			pane: input.target.id
		};
	} catch (err) {
		return {
			rung: false,
			pane: input.target.id,
			warning: err instanceof Error ? err.message : String(err)
		};
	}
}
//#endregion
//#region src/mux-select.ts
/**
* Backend selection via cyber-mux's two-mode mux probe, normalized through the transitional
* `$CYBERLEGION_MUX*` → `$CYBER_MUX*` env seam (`mux-env.ts`) — tmux/herdr map to their existing
* cyber-mux adapters.
*
* cyber-mux detects MORE backends than `unit/registry`'s `AgentRecord.pane` can carry a locator
* under (`'tmux' | 'herdr'` only). A DETECTED wezterm/zellij is refused HERE, before anything opens,
* naming the backend it found (mux.feature: "a detected backend a unit record cannot carry is
* refused before opening anything") — driving it would open a real pane no record could name,
* stranding a live session `prune` can never reap and no caller can nudge. Anything else (`none`,
* `screen`) falls through to the plain "no backend" refusal, unchanged from before the migration.
*/
function selectSessionAdapter(env, exec = realExec) {
	const probe = probeMultiplexer(exec, normalizeMuxEnv(env));
	if (probe.mux === "tmux") return tmuxMuxAdapter;
	if (probe.mux === "herdr") return herdrMuxAdapter;
	if (probe.mux === "wezterm" || probe.mux === "zellij") throw new Error(`spawn detected ${probe.mux}, a backend unit/registry cannot store a pane locator under (only tmux and herdr) — refusing before opening anything`);
	throw new Error("spawn requires a session backend — run inside tmux ($TMUX) or herdr ($HERDR_ENV=1)");
}
//#endregion
//#region src/workspace-label.ts
/** Leading actions that tear down or revert — the `A2-` class, checked first. */
const TEARDOWN_ACTIONS = /* @__PURE__ */ new Set([
	"clean",
	"cleanup",
	"decommission",
	"delete",
	"deprecate",
	"disable",
	"drop",
	"prune",
	"purge",
	"remove",
	"retire",
	"revert",
	"revoke",
	"rollback",
	"teardown",
	"undo",
	"uninstall",
	"unregister"
]);
/** Leading actions that only look and report — the `9S-` class, checked after teardown. */
const RECON_ACTIONS = /* @__PURE__ */ new Set([
	"analyze",
	"assess",
	"audit",
	"check",
	"compare",
	"debug",
	"diagnose",
	"evaluate",
	"examine",
	"explain",
	"explore",
	"find",
	"identify",
	"inspect",
	"investigate",
	"locate",
	"measure",
	"profile",
	"read",
	"reproduce",
	"research",
	"review",
	"scan",
	"survey",
	"trace",
	"triage",
	"verify"
]);
/**
* Leading actions that build or change — the `2B-` class. `2B-` is also the code for a brief whose
* lead matches nothing at all, but the two cases differ in the SUBJECT: a recognized action is
* dropped from it (the code already says "build"), an unrecognized leading word is kept (it is the
* subject's own first noun, and dropping it would strip real signal).
*/
const BUILD_ACTIONS = /* @__PURE__ */ new Set([
	"add",
	"backfill",
	"build",
	"create",
	"document",
	"enable",
	"extend",
	"fix",
	"generalize",
	"harden",
	"implement",
	"introduce",
	"make",
	"migrate",
	"move",
	"port",
	"refactor",
	"rename",
	"replace",
	"rework",
	"ship",
	"split",
	"support",
	"swap",
	"update",
	"wire",
	"write"
]);
/** Dropped when it leads the subject — an article carries no identifying signal. */
const LEADING_ARTICLES = /* @__PURE__ */ new Set([
	"a",
	"an",
	"the"
]);
/**
* Resolve the label a `workspace` placement opens under. Total width never exceeds `LABEL_CAP`, and
* the result always carries a code — a brief that yields no usable subject falls back to the unit's
* own short id rather than to a bare code.
*/
function deriveWorkspaceLabel(input) {
	const briefWords = tokenize(firstNonEmptyLine(input.brief));
	const lead = briefWords[0];
	let code = "2B-";
	let leadIsAction = false;
	if (lead && TEARDOWN_ACTIONS.has(lead)) {
		code = "A2-";
		leadIsAction = true;
	} else if (lead && RECON_ACTIONS.has(lead)) {
		code = "9S-";
		leadIsAction = true;
	} else if (lead && BUILD_ACTIONS.has(lead)) leadIsAction = true;
	let subjectWords;
	if (input.handle) subjectWords = tokenize(input.handle);
	else {
		subjectWords = leadIsAction ? briefWords.slice(1) : briefWords.slice();
		if (subjectWords[0] && LEADING_ARTICLES.has(subjectWords[0])) subjectWords.shift();
	}
	const subject = fitWords(subjectWords, 27) || input.id.slice(0, 6);
	return `${code}${subject}`;
}
/** The brief's first line with any content — a leading blank line is not the subject. */
function firstNonEmptyLine(brief) {
	for (const line of brief.split("\n")) if (line.trim() !== "") return line;
	return "";
}
/** Lowercase alphanumeric runs; every other character is a separator, never part of a word. */
function tokenize(text) {
	return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== "");
}
/**
* Join whole words with `-` while they fit `budget`, so the label ends on a complete word rather
* than mid-word. A single first word wider than the whole budget is hard-truncated — that is the
* only case where a label can end mid-word, and the alternative is no subject at all.
*/
function fitWords(words, budget) {
	if (words.length === 0) return "";
	let out = words[0].slice(0, budget);
	for (const word of words.slice(1)) {
		const next = `${out}-${word}`;
		if (next.length > budget) break;
		out = next;
	}
	return out;
}
//#endregion
//#region src/session.ts
/** How each harness's own CLI is launched in the new pane. */
const LAUNCH_MAP = {
	claude: "claude",
	cursor: "cursor-agent",
	codex: "codex"
};
/**
* Per-harness fresh-context ("reset") command `clear` injects into a warm peer's pane to return
* its conversation to a cold context without tearing the pane/session down — keyed on genuine
* fresh-context semantics, never on the literal word "clear".
*/
const RESET_MAP = {
	claude: "/clear",
	codex: "/clear",
	copilot: "/clear",
	cursor: "/new-chat"
};
/**
* Harnesses whose apparent "clear" command does NOT truly empty the model context — e.g. gemini's
* `/clear` wipes only the terminal screen, leaving the model's own context stale. There is no
* honest fresh-context command for these, so they are refused explicitly rather than lumped in
* with a harness that is merely unmapped.
*/
const FALSE_FRIEND_HARNESSES = /* @__PURE__ */ new Set(["gemini"]);
/**
* Resolve `harness`'s own fresh-context command from the reset map. String-keyed (not `Harness`)
* so it also guards a harness present in `LAUNCH_MAP`/`identity.ts`'s `Harness` union but not yet
* given an honest reset mapping here. Throws rather than guessing:
* - a known false-friend harness (its "clear" only clears the screen, not the context)
* - any harness absent from the map entirely
*/
function resetCommandFor(harness) {
	const mapped = RESET_MAP[harness];
	if (mapped) return mapped;
	if (FALSE_FRIEND_HARNESSES.has(harness)) throw new Error(`"${harness}" has no honest fresh-context command — its own "/clear" clears only the terminal screen, not the model context, so unit clear refuses to send a false-friend reset that would leave stale context behind`);
	throw new Error(`"${harness}" is not in the reset map (${Object.keys(RESET_MAP).join(" | ")}) — unit clear refuses to guess a command`);
}
/**
* Launch a new peer session as a genuine sibling unit: create a real git worktree distinct from
* the primary checkout (refuse the primary checkout), open a session backend (tmux or herdr) with
* its cwd set to that worktree, pre-register the peer, and drop its brief as a file — never typed
* into its prompt. Nothing loads that file for the peer: it is the spawn wake that tells the peer to
* go read it, naming its path (`spawnAndWake` below, and ADR-0032). `spawn` alone therefore leaves a
* peer sitting idle with its brief unread, which is why callers want `spawnAndWake`.
*
* Spawned unit worktrees live sibling to the primary checkout (`<parent>/<repo>.worktrees/legion-<id6>`),
* never nested inside it, even though the registry/mailbox itself lives in the global hub — the hub
* addresses units across project and worktree boundaries, but a unit's checkout is necessarily
* scoped to this one project's git remote.
*/
function spawn(ctx, input) {
	ctx.store.ensureMarker();
	const env = ctx.env ?? process.env;
	const exec = ctx.exec ?? realExec;
	const sessionAdapter = selectSessionAdapter(env, exec);
	const normalizedEnv = normalizeMuxEnv(env);
	const harness = input.harness;
	if (!harness || !(harness in LAUNCH_MAP)) throw new Error(`spawn needs a --harness in the launch map (${Object.keys(LAUNCH_MAP).join(" | ")})`);
	const brief = resolveBrief(input);
	if (brief == null) throw new Error("spawn needs a brief — pass --task <text>, --task - (stdin), or --brief-file <path>");
	if (input.cwd && (input.branch || input.worktreePath)) throw new Error("--cwd cannot combine with the worktree-creating flags --branch/--worktree-path");
	const id = randomId();
	const primaryRoot = resolvePrimaryRoot(exec);
	const launch = input.command ?? LAUNCH_MAP[harness];
	const fullLaunch = `${muxEnvPrefix(sessionAdapter.name)}${launch}`;
	const from = callerPane(sessionAdapter, normalizedEnv);
	let cwd;
	let worktree;
	let target;
	if (input.cwd) {
		if (!existsSync(input.cwd)) throw new Error(`--cwd directory must already exist: ${input.cwd}`);
		cwd = resolve(input.cwd);
		assertDistinctFromPrimary(cwd, primaryRoot);
		worktree = null;
		const at = input.at ?? "tab";
		target = sessionAdapter.open(exec, {
			cwd,
			launch: fullLaunch,
			at,
			from,
			...labelFor(at, input, brief, id)
		});
	} else {
		const branch = input.branch ?? `cyberlegion/unit-${id}`;
		const at = input.at ?? "workspace";
		const worktreePath = input.worktreePath ?? resolveUnitWorktreePath(primaryRoot, id.slice(0, 6));
		assertDistinctFromPrimary(resolve(worktreePath), primaryRoot);
		if (at === "workspace" && sessionAdapter.worktree) {
			const opened = sessionAdapter.worktree.createInWorkspace(exec, {
				primaryRoot,
				branch,
				path: worktreePath,
				launch: fullLaunch,
				...labelFor(at, input, brief, id)
			});
			assertDistinctFromPrimary(opened.worktree.root, primaryRoot);
			ensureMarker(join(opened.worktree.root, ".agents", "cyberlegion"));
			cwd = opened.worktree.root;
			worktree = opened.worktree;
			target = opened.target;
		} else {
			const added = gitWorktreeAdapter.add(exec, {
				primaryRoot,
				path: worktreePath,
				branch
			});
			assertDistinctFromPrimary(added.root, primaryRoot);
			ensureMarker(join(added.root, ".agents", "cyberlegion"));
			cwd = added.root;
			worktree = added;
			target = sessionAdapter.open(exec, {
				cwd,
				launch: fullLaunch,
				at,
				from,
				...labelFor(at, input, brief, id)
			});
		}
	}
	const ts = new Date(ctx.now?.() ?? Date.now()).toISOString();
	const muxName = sessionAdapter.name;
	const rec = {
		id,
		handle: input.handle ?? id.slice(0, 6),
		harness,
		cwd,
		worktree,
		pane: muxName === "tmux" || muxName === "herdr" ? {
			mux: muxName,
			id: target.id
		} : null,
		status: "active",
		createdAt: ts,
		lastSeen: ts,
		brief: paths.briefFile(ctx.store.root, id),
		...resolveSelfId(ctx) ? { spawnedBy: resolveSelfId(ctx) } : {}
	};
	saveAgent(ctx.store, rec);
	ctx.store.putPaneIndex(target.id, id);
	ctx.store.writeBrief(id, composeBrief(brief, input.briefInstructions));
	return {
		agent: rec,
		pane: target.id,
		launch
	};
}
/**
* `unit spawn` end to end: open the peer, then deliver its first turn.
*
* The two acts live together here rather than at the CLI call site so the **brief path the doorbell
* names is derived from the record `spawn` just wrote**, not handed in by a caller. That is the
* point of the seam: a caller cannot ring with the wrong path because it supplies no path — an
* empty string, a stale path, or the brief's whole body are all unrepresentable here, rather than
* merely untested.
*
* The ring is best-effort on top of the guaranteed spawn effect (worktree + session + registry
* record): `--no-wake` rings nothing, and a ring that never completes is reported as a warning on
* the result rather than thrown, so it can never fail a spawn that already landed.
*/
async function spawnAndWake(ctx, input, options = {}) {
	const res = spawn(ctx, input);
	const env = ctx.env ?? process.env;
	const exec = ctx.exec ?? realExec;
	const briefPath = res.agent.brief;
	const wake = await wakeSpawn(() => selectSessionAdapter(env, exec), exec, {
		target: { id: res.pane },
		briefPath: briefPath ?? "",
		noWake: options.noWake || !briefPath
	}, options.nudgeOpts);
	return {
		...res,
		rung: wake.rung,
		...wake.warning ? { warning: wake.warning } : {}
	};
}
/**
* The label a `workspace` placement opens under — the short human-scannable name that makes a unit's
* own visible space findable by eye (`console/workspace-label.ts` owns the naming rule). Only the
* `workspace` placement carries one: a pane or tab lives inside a space the caller is already
* looking at, so it has nothing of its own to name. Spread into the adapter options, so a
* non-workspace placement passes no `label` key at all rather than an explicit `undefined`.
*
* The gate is load-bearing, not defensive: cyber-mux names whatever tier `at` opens — a workspace,
* a tab, or a pane — so passing a label on a `tab` placement would rename the caller's own tab.
* Exported so that gate is tested directly rather than only through a backend's arguments.
*/
function labelFor(at, input, brief, id) {
	if (at !== "workspace") return {};
	return { label: deriveWorkspaceLabel({
		brief,
		handle: input.handle,
		id
	}) };
}
/**
* The env prefix typed ahead of the launch command so the spawned peer inherits the caller's
* multiplexer fast-path and never has to run its own ancestry discovery (`$CYBER_MUX` /
* `$CYBER_MUX_PANE`). `VAR=val cmd` scopes the vars to that one process (and its children)
* without needing `export`. tmux natively sets `$TMUX_PANE` for a pane's own processes, so the
* pane var is expanded by the child's own shell rather than baked in here.
*/
function muxEnvPrefix(muxName) {
	if (muxName === "tmux") return "CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE ";
	if (muxName === "herdr") return "CYBER_MUX=herdr ";
	return "";
}
/**
* Resolve a unit's live session pane from a ref, or throw naming the ref. The one place
* focus/nudge/read agree on what "addressable" means — a record's own pane, else a pane pointer
* keyed by its id (a herdr peer stores its pane only in that index).
*/
function paneTargetOf(ctx, ref) {
	const agent = resolveAgent(ctx.store, ref);
	const pane = agent.pane?.id ?? ctx.store.findPaneByAgentId(agent.id);
	if (!pane) throw new Error(`unit "${ref}" has no known session pane`);
	return {
		agent,
		target: { id: pane }
	};
}
/**
* Move input focus to a peer's session. The adapter beams the attached view all the way there —
* across workspace and tab — rather than no-opping when the peer sits outside the caller's current
* workspace, and surfaces a backend failure instead of reporting a false success.
*
* Lives here rather than inline in the CLI for the same reason `spawnAndWake` does: composed at the
* call site it took a hardcoded `realExec`, so the operation could not be driven with an injected
* exec and its success path was unreachable from a test.
*/
function focusUnit(ctx, ref) {
	const { agent, target } = paneTargetOf(ctx, ref);
	const exec = ctx.exec ?? realExec;
	selectSessionAdapter(ctx.env ?? process.env, exec).focus(exec, target);
	return {
		agent,
		pane: target.id
	};
}
/**
* Ring a peer's session as a **taken turn**, not fire-and-forget: `nudge` submits, reads the pane
* back to confirm the text is no longer staged, and flushes the staged buffer (never re-typing) up
* to a bounded cap — then throws if the peer never took the turn. A doorbell must carry text; an
* empty ring is a no-op, so the default points the peer at its inbox.
*/
async function nudgeUnit(ctx, ref, options = {}) {
	const { agent, target } = paneTargetOf(ctx, ref);
	const exec = ctx.exec ?? realExec;
	const message = options.message || "You have unread mail — check your inbox.";
	const result = await nudge(selectSessionAdapter(ctx.env ?? process.env, exec), exec, target, message, options.nudgeOpts);
	return {
		agent,
		pane: target.id,
		message,
		resubmits: result.resubmits
	};
}
/** Scrape the trailing output of a peer's session screen. */
function readUnit(ctx, ref, options = {}) {
	const { agent, target } = paneTargetOf(ctx, ref);
	const exec = ctx.exec ?? realExec;
	const output = selectSessionAdapter(ctx.env ?? process.env, exec).read(exec, target, { lines: options.lines }).text;
	return {
		agent,
		pane: target.id,
		output
	};
}
/**
* Reset a warm peer's context to cold WITHOUT tearing anything down — injects the peer's own
* harness fresh-context command (`resetCommandFor`) into its pane through the session adapter.
* Warmth is the unit (pane/process stays warm — no cold-start), coldness is the context. The
* command is resolved (and any false-friend/unmapped harness throws) BEFORE anything is sent, so
* a fail-loud harness never has anything typed into its pane. Touches neither the registry record
* nor the worktree — `close` (`decommission`) owns teardown.
*/
function clearUnit(ctx, ref) {
	const { agent, target } = paneTargetOf(ctx, ref);
	const pane = target.id;
	if (!agent.harness) throw new Error(`unit "${ref}" has no harness on record — cannot resolve its reset command`);
	const command = resetCommandFor(agent.harness);
	const env = ctx.env ?? process.env;
	const exec = ctx.exec ?? realExec;
	selectSessionAdapter(env, exec).submit(exec, { id: pane }, command);
	return {
		agent,
		pane,
		command
	};
}
/** The brief file's text: the task alone, or — when the harness took no instructions on its command
* line — the def's instructions under their own heading ahead of it, so the peer can see they reach
* it as a user turn rather than a system prompt. */
function composeBrief(brief, instructions) {
	if (!instructions) return brief;
	return `## Agent instructions\n\n${instructions}\n\n## Brief\n\n${brief}`;
}
/** Resolve a spawn brief from --brief-file, --task -, or --task <text>; null if no source given. */
function resolveBrief(input, readStdin = () => readFileSync(0, "utf8")) {
	if (input.briefFile) return readFileSync(input.briefFile, "utf8");
	if (input.task === "-") return readStdin();
	if (input.task != null && input.task !== "") return input.task;
	return null;
}
//#endregion
//#region src/agentdef/resolve.ts
function parseAgentDefFile(text) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/.exec(text);
	if (!m) return {
		fm: {},
		instructions: text.trim()
	};
	const [, block, rest] = m;
	const fm = {};
	const lines = block.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i].replace(/\r$/, "");
		if (line.trim() === "" || line.trim().startsWith("#")) {
			i++;
			continue;
		}
		if (line.length - line.trimStart().length > 0) {
			i++;
			continue;
		}
		const idx = line.indexOf(":");
		if (idx === -1) {
			i++;
			continue;
		}
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		i++;
		if (value === ">" || value === ">-" || value === "|" || value === "|-") {
			const parts = [];
			while (i < lines.length) {
				const l = lines[i].replace(/\r$/, "");
				if (l.trim() === "") {
					i++;
					continue;
				}
				if (l.length - l.trimStart().length === 0) break;
				parts.push(l.trim());
				i++;
			}
			value = parts.join(value.startsWith("|") ? "\n" : " ");
		}
		fm[key] = unquote(value);
	}
	return {
		fm,
		instructions: rest.trim()
	};
}
function unquote(v) {
	if (v.length >= 2 && (v.startsWith("\"") && v.endsWith("\"") || v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
	return v;
}
function toBool(v) {
	if (v === void 0) return void 0;
	if (v === "true") return true;
	if (v === "false") return false;
}
/** The known harnesses are exactly those with a launch binary — one home for the set. */
const HARNESSES = Object.keys(LAUNCH_MAP);
/** A `harness` tag outside the known set has no launch binary, so a typo fails here, loudly, rather
* than surfacing later as an unlaunchable command. */
function toHarness(value, path) {
	if (value === void 0 || HARNESSES.includes(value)) return value;
	throw new Error(`agent def "${path}" has unknown harness "${value}" — expected one of ${HARNESSES.join(", ")}`);
}
function toAgentDef(path, text, fallbackName) {
	const { fm, instructions } = parseAgentDefFile(text);
	return {
		name: fm.name ?? fallbackName,
		description: fm.description,
		model: fm.model,
		effort: fm.effort,
		harness: toHarness(fm.harness, path),
		warm: toBool(fm.warm),
		interactive: toBool(fm.interactive),
		instructions,
		path
	};
}
/** The project's own `.agents/agents/` dir — the convention `agent list`/name-search scans. */
function projectAgentsDir(cwd) {
	return join(projectRoot(cwd), ".agents", "agents");
}
/** Resolve one agent definition, by explicit file or by name search. Throws a clear error when
* neither locates a def — never returns a partial/empty result. */
function resolveAgentDef(input) {
	if (input.file) {
		const path = resolve(input.file);
		if (!existsSync(path)) throw new Error(`agent def file "${input.file}" does not exist`);
		return toAgentDef(path, readFileSync(path, "utf8"), basename(path).replace(/\.md$/, ""));
	}
	if (!input.name) throw new Error("resolveAgentDef needs a --agent <name> or --agent-file <path>");
	const roots = [...input.searchRoots ?? [], projectAgentsDir(input.cwd)];
	for (const root of roots) {
		const candidate = join(root, `${input.name}.md`);
		if (existsSync(candidate)) return toAgentDef(candidate, readFileSync(candidate, "utf8"), input.name);
	}
	throw new Error(`no agent definition named "${input.name}" found under .agents/agents/`);
}
/** List every resolvable agent def under `.agents/agents/` (+ any extra search roots). Definitive
* empty array when the dir is absent or empty — never throws for "none found" here (unlike a
* named resolve, listing is inherently zero-or-more). */
function listAgentDefs(input = {}) {
	const roots = [...input.searchRoots ?? [], projectAgentsDir(input.cwd)];
	const seen = /* @__PURE__ */ new Set();
	const defs = [];
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const file of readdirSync(root)) {
			if (!file.endsWith(".md")) continue;
			const path = join(root, file);
			if (seen.has(path)) continue;
			seen.add(path);
			defs.push(toAgentDef(path, readFileSync(path, "utf8"), file.replace(/\.md$/, "")));
		}
	}
	return defs;
}
//#endregion
//#region src/agentdef/realize.ts
const DEFAULT_HARNESS = "claude";
/** POSIX single-quote a value for safe inclusion in a shell command line. */
function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
/** Cursor carries effort as a bracket parameter on the model (`<model>[effort=<level>]`): merge it into
* any bracket list the model already has, replacing an `effort=` already there. */
function withCursorEffort(model, effort) {
	const open = model.lastIndexOf("[");
	if (open === -1 || !model.endsWith("]")) return `${model}[effort=${effort}]`;
	const params = model.slice(open + 1, -1).split(",").filter((p) => p !== "" && !p.startsWith("effort="));
	return `${model.slice(0, open)}[${[...params, `effort=${effort}`].join(",")}]`;
}
/** The model + effort arguments for one harness. No two harnesses spell effort alike: claude has
* `--effort`, codex only a config override, cursor only a parameter on the model — so a cursor
* effort with no model has nowhere to go and throws rather than launching at the default effort. */
function modelAndEffortArgs(harness, model, effort) {
	if (harness === "cursor") {
		if (effort && !model) throw new Error(`cursor carries effort only as a parameter on the model; set a model to launch with effort "${effort}"`);
		if (!model) return [];
		return ["--model", shellQuote(effort ? withCursorEffort(model, effort) : model)];
	}
	const args = model ? ["--model", shellQuote(model)] : [];
	if (!effort) return args;
	if (harness === "codex") return [
		...args,
		"-c",
		shellQuote(`model_reasoning_effort="${effort}"`)
	];
	return [
		...args,
		"--effort",
		shellQuote(effort)
	];
}
/** A TOML basic string: JSON's escapes are all legal TOML escapes, and TOML also forbids a raw DEL. */
function tomlBasicString(value) {
	return JSON.stringify(value).replace(/\x7f/g, "\\u007f");
}
/** The instruction arguments for one harness. Only claude has an append-to-system-prompt flag;
* codex takes a `developer_instructions` config override, added on top of its own base
* instructions. Cursor has no channel at all — its instructions go to the brief instead. */
function instructionArgs(harness, instructions) {
	if (!instructions || harness === "cursor") return [];
	if (harness === "claude") return ["--append-system-prompt", shellQuote(instructions)];
	return ["-c", shellQuote(`developer_instructions=${tomlBasicString(instructions)}`)];
}
/** Build the harness launch invocation for a def — explicit `model`/`effort`/`harness` win over the
* def's own tags, which win over the harness default. The def's effort and instructions each go
* through the harness's own control (see `modelAndEffortArgs`, `instructionArgs`). */
function realizeLaunch(def, opts = {}) {
	const harness = opts.harness ?? def.harness ?? DEFAULT_HARNESS;
	const model = opts.model ?? def.model;
	const effort = opts.effort ?? def.effort;
	const parts = [
		LAUNCH_MAP[harness],
		...modelAndEffortArgs(harness, model, effort),
		...instructionArgs(harness, def.instructions)
	];
	const briefInstructions = harness === "cursor" && def.instructions ? def.instructions : void 0;
	return {
		harness,
		command: parts.join(" "),
		model,
		effort,
		...briefInstructions ? { briefInstructions } : {}
	};
}
/**
* Resolve what `unit spawn` should launch, from either an explicit `--harness` or an agent def
* (`--agent` / `--agent-file`) whose harness, model, effort and instructions compose the launch
* command. An explicit `--harness`/`--model`/`--effort` overrides the def's own, for this launch only.
* With no def, a `--model`/`--effort` composes a launch from `--harness` alone; with neither, the
* harness's own default command stands (no `command` returned).
*
* Extracted from the CLI action so the def→launch wiring is reachable from a test: composed inline
* it sat between two well-covered halves (`resolveAgentDef`, `realizeLaunch`) with nothing
* exercising the join between them.
*/
function resolveSpawnLaunch(input) {
	const overrides = {
		harness: input.harness,
		model: input.model,
		effort: input.effort
	};
	if (!input.agent && !input.agentFile) {
		if (!input.harness || !input.model && !input.effort) return { harness: input.harness };
		return realizeLaunch({
			name: input.harness,
			instructions: "",
			path: ""
		}, overrides);
	}
	return realizeLaunch(resolveAgentDef({
		name: input.agent,
		file: input.agentFile,
		...input.cwd ? { cwd: input.cwd } : {},
		...input.searchRoots ? { searchRoots: input.searchRoots } : {}
	}), overrides);
}
//#endregion
//#region src/cli-input.ts
/**
* Translate `unit spawn`'s options into the spawn input and its wake decision — resolving an
* `--agent`/`--agent-file` def into the harness and composed launch command, with an explicit
* `--harness`/`--model`/`--effort` overriding the def's own.
*
* Throws when no harness can be resolved, so the CLI's own `fail()` still renders it.
*/
function spawnCommandInput(opts) {
	const { harness, command, model, effort, briefInstructions } = resolveSpawnLaunch({
		agent: opts.agent,
		agentFile: opts.agentFile,
		harness: opts.harness,
		model: opts.model,
		effort: opts.effort
	});
	if (!harness) throw new Error("unit spawn needs --harness, or --agent/--agent-file resolving one");
	return {
		input: {
			harness,
			command,
			briefInstructions,
			task: opts.task,
			briefFile: opts.briefFile,
			handle: opts.handle,
			branch: opts.branch,
			worktreePath: opts.worktreePath,
			cwd: opts.cwd,
			at: opts.at
		},
		noWake: opts.wake === false,
		launched: {
			model,
			effort
		}
	};
}
/** What `unit read` prints: the raw scrape, or the JSON envelope under `--format json`. */
function readCommandOutput(format, result) {
	return format === "json" ? JSON.stringify(result, null, 2) : result.output;
}
//#endregion
//#region src/decommission.ts
/**
* Tear a unit down and reap its registry record — the deterministic inverse of `spawn`. Refuses
* the primary checkout (absolute — neither `--force` nor `--keep-worktree` overrides it) and a
* dirty worktree unless `--force`. Teardown always precedes reap: an already-gone worktree or pane
* is tolerated, but a genuine worktree-removal failure aborts and leaves the record intact so the
* operation is retryable.
*
* `keepWorktree` reaps everything else — pane, record, pane pointer, brief — and leaves the
* checkout on disk, reporting it as `retainedWorktree`.
*/
function decommission(ctx, input) {
	const rec = loadAgent(ctx.store, input.id);
	if (!rec) throw new Error(`no unit registered as agents/${input.id}.json — nothing to decommission`);
	if (rec.kind === "service") throw new Error(`refusing to decommission "${input.id}" — it is a service endpoint, not a unit`);
	const exec = ctx.exec ?? realExec;
	const env = ctx.env ?? process.env;
	const worktreeRoot = rec.worktree?.root;
	const primaryRoot = worktreeRoot ? resolvePrimaryRoot(exec) : void 0;
	if (worktreeRoot && resolve(worktreeRoot) === resolve(primaryRoot)) throw new Error(`refusing to decommission "${input.id}" — its worktree is the primary checkout; neither --force nor --keep-worktree overrides this`);
	const worktreeExists = worktreeRoot != null && existsSync(worktreeRoot);
	const removesWorktree = worktreeExists && !input.keepWorktree;
	if (removesWorktree && !input.force && isDirty(exec, worktreeRoot)) throw new Error(`unit "${input.id}" has uncommitted changes in its worktree — pass --force to discard them`);
	const pane = rec.pane?.id ?? ctx.store.findPaneByAgentId(input.id);
	if (removesWorktree) try {
		gitWorktreeAdapter.remove(exec, worktreeRoot, { primaryRoot });
	} catch (err) {
		throw new Error(`decommission "${input.id}" aborted — worktree removal failed, record left intact for retry: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (pane) try {
		selectSessionAdapter(env, exec).teardown(exec, { id: pane });
	} catch {}
	ctx.store.removeAgent(input.id);
	if (pane) ctx.store.removePaneIndex(pane);
	ctx.store.removeAgentData(input.id);
	return {
		agent: rec,
		worktreeRoot,
		retainedWorktree: worktreeExists && input.keepWorktree ? worktreeRoot : void 0,
		pane
	};
}
function isDirty(exec, worktreeRoot) {
	return !!exec("git", [
		"-C",
		worktreeRoot,
		"status",
		"--porcelain"
	]);
}
//#endregion
//#region src/install.ts
const PIN_TOKEN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;
function validatePin(pin) {
	if (!PIN_TOKEN.test(pin)) throw new Error(`invalid --pin "${pin}" — expected a version or dist-tag token like 0.2.0 or latest (no spaces, ranges, or shell metacharacters)`);
}
const hookCommand = (event, pin) => pin ? `npx cyberlegion@${pin} mail hook --event ${event}` : `npx cyberlegion mail hook --event ${event}`;
function hookTarget(command) {
	return command.match(/^(?:npx cyberlegion(?:@[^\s]+)?|cyberlegion) (mail hook --event \S+)$/)?.[1];
}
const VENDORS = {
	claude: {
		file: ".claude/settings.json",
		shape: "claude",
		events: {
			SessionStart: "SessionStart",
			PostToolUse: "PostToolUse"
		}
	},
	cursor: {
		file: ".cursor/hooks.json",
		shape: "cursor",
		events: { SessionStart: "sessionStart" }
	},
	codex: {
		file: ".codex/hooks.json",
		shape: "cursor",
		events: {
			SessionStart: "SessionStart",
			PostToolUse: "PostToolUse"
		}
	}
};
function readJson(file) {
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return {};
	}
}
function writeJson$1(file, data) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
/** Register the surfacing hook into one harness's config, idempotently. */
function install(harness, projectDir = process.cwd(), pin) {
	const spec = VENDORS[harness];
	if (!spec) throw new Error(`unknown harness "${harness}" (expected claude | cursor | codex)`);
	if (pin !== void 0) validatePin(pin);
	const file = join(projectDir, spec.file);
	const settings = readJson(file);
	const results = [];
	for (const [canonical, vendorEvent] of Object.entries(spec.events)) {
		const command = hookCommand(canonical, pin);
		const status = spec.shape === "claude" ? upsertClaude(settings, vendorEvent, command) : upsertCursor(settings, vendorEvent, command);
		results.push({
			harness,
			event: canonical,
			vendorEvent,
			file,
			status
		});
	}
	writeJson$1(file, settings);
	return results;
}
function upsertClaude(settings, event, command) {
	const hooks = settings.hooks ??= {};
	const groups = hooks[event] ??= [];
	const target = hookTarget(command);
	for (const g of groups) for (const h of g.hooks ?? []) {
		if (h.command === command) return "already present";
		if (target && hookTarget(h.command) === target) {
			h.command = command;
			return "already present";
		}
	}
	const group = { hooks: [{
		type: "command",
		command
	}] };
	if (event === "PostToolUse") group.matcher = "Write|Edit";
	groups.push(group);
	return "registered";
}
function upsertCursor(settings, event, command) {
	if (settings.version == null) settings.version = 1;
	const hooks = settings.hooks ??= {};
	const list = hooks[event] ??= [];
	const target = hookTarget(command);
	for (const h of list) {
		if (h.command === command) return "already present";
		if (target && hookTarget(h.command) === target) {
			h.command = command;
			return "already present";
		}
	}
	list.push({ command });
	return "registered";
}
//#endregion
//#region src/message.ts
/** Write one message into the recipient's inbox. Collision-free by <epochMs>-<hex>. */
function send(ctx, input) {
	const toId = resolveRecipient(ctx.store, input.to);
	const from = loadAgent(ctx.store, input.fromId);
	const ts = ctx.now?.() ?? Date.now();
	const msg = {
		id: `${ts}-${randomBytes(3).toString("hex")}`,
		from: input.fromId,
		fromHandle: from?.handle ?? input.fromId,
		to: toId,
		...input.subject ? { subject: input.subject } : {},
		body: input.body,
		...input.thread ? { thread: input.thread } : {},
		...input.replyTo ? { replyTo: input.replyTo } : {},
		ts,
		sentAt: new Date(ts).toISOString()
	};
	ctx.store.putMessage(toId, msg);
	return msg;
}
/** Resolve a message body from the --body flag, a --body-file path, or stdin (--body-file -). */
function resolveBody(body, bodyFile, readStdin = () => readFileSync(0, "utf8")) {
	if (body != null) return body;
	if (bodyFile) return bodyFile === "-" ? readStdin() : readFileSync(bodyFile, "utf8");
	throw new Error("provide --body <text> or --body-file <path|->");
}
/** List the caller's mail, chronological (lexical id sort == time order). */
function inbox(ctx, q) {
	const snap = ctx.store.listInbox(q.meId);
	const unread = snap.unread.map((m) => ({
		...m,
		read: false
	}));
	const acked = q.unread ? [] : snap.read.map((m) => ({
		...m,
		read: true
	}));
	let items = [...unread, ...acked];
	if (q.from) items = items.filter((m) => m.from === q.from || m.fromHandle === q.from);
	if (q.thread) items = items.filter((m) => m.thread === q.thread);
	return items.sort((a, b) => a.id.localeCompare(b.id));
}
/** Peek at a message (unread or already-acked) without changing its state. */
function peek(ctx, meId, msgId) {
	const snap = ctx.store.listInbox(meId);
	return [...snap.unread, ...snap.read].find((m) => m.id === msgId);
}
/** Acknowledge a message by moving it out of the unread set. Errors if not currently unread. */
function ack(ctx, meId, msgId) {
	return ctx.store.ackMessage(meId, msgId);
}
/** Read and consume a message in one atomic step: returns the body and acks it if still unread.
* Idempotent — an already-acked message is returned with `acked: false` rather than erroring (unlike
* bare `ack`); an unknown message id throws. Backs `mail read --ack`. */
function readAck(ctx, meId, msgId) {
	const snap = ctx.store.listInbox(meId);
	if (snap.unread.some((m) => m.id === msgId)) return {
		msg: ctx.store.ackMessage(meId, msgId),
		acked: true
	};
	const already = snap.read.find((m) => m.id === msgId);
	if (already) return {
		msg: already,
		acked: false
	};
	throw new Error(`"${msgId}" is not a message in this inbox`);
}
/** Permanently remove a message (unread or already-acked) from the caller's inbox. */
function deleteMessage(ctx, meId, msgId) {
	ctx.store.removeMessage(meId, msgId);
}
//#endregion
//#region src/output.ts
function stringifyCell(v) {
	if (v == null) return "";
	const s = String(v);
	return /[,\n"]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}
/** One TOON-encoded object: `key: value` lines, blank/undefined fields dropped. */
function toonObject(fields) {
	return Object.entries(fields).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join("\n");
}
/** One TOON-encoded list: a `name[N]{field,...}:` header plus one row per item, then an aggregate
* summary line. Definitive on empty — still emits `name[0]{...}:` plus the summary line. */
function toonList(name, items, fields, summary) {
	return [
		`${name}[${items.length}]{${fields.map((f) => f.key).join(",")}}:`,
		...items.map((item) => fields.map((f) => stringifyCell(f.get(item))).join(",")).map((r) => `  ${r}`),
		summary
	].join("\n");
}
/** Print a command's result to stdout in the requested format. */
function emit(format, payload) {
	if (format === "json") console.log(JSON.stringify(payload.json, null, 2));
	else console.log(payload.toon);
}
/** A stderr-only next-step suggestion — never part of the machine-readable stdout result. */
function nextStep(msg) {
	console.error(`→ ${msg}`);
}
/** A structured, fail-loud error: stderr + exit 1. Never prompts, never partially writes. */
function fail(msg) {
	console.error(JSON.stringify({ error: msg }));
	process.exit(1);
}
//#endregion
//#region src/project.ts
/**
* The canonical git common dir for `dir`, or undefined outside a repository. The common dir is the
* one path every checkout of a repository shares — the default checkout and each linked worktree
* all report the same `.git` — so it is what makes "same project from two worktrees" one reference.
* Realpath'd so a symlinked path to the same repository cannot mint a second id.
*/
function commonDirOf(exec, dir) {
	const out = exec("git", [
		"-C",
		dir,
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir"
	]);
	if (!out) return void 0;
	return realOrResolved(out);
}
/**
* Derive a project's stable reference from its canonical common dir. Deterministic rather than
* minted, so two worktrees registering the same project at the same instant converge on one id with
* no lock, and two unrelated repositories that merely share a directory name never collide.
*/
function projectIdOf(commonDir) {
	return `prj-${createHash("sha256").update(commonDir).digest("hex").slice(0, 16)}`;
}
function realOrResolved(path) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
/**
* The default checkout's root, and whether that answer is authoritative. Asked from the default
* checkout itself (its git dir IS the common dir), `--show-toplevel` is exact wherever the git dir
* lives. Asked from a linked worktree, git has no pointer back to the default checkout when its git
* dir was separated (`git init --separate-git-dir`) — even `git worktree list` then reports the git
* dir — so the common dir's parent is only a guess.
*/
function defaultCheckoutOf(exec, dir, commonDir) {
	const gitDir = exec("git", [
		"-C",
		dir,
		"rev-parse",
		"--path-format=absolute",
		"--git-dir"
	]);
	const top = exec("git", [
		"-C",
		dir,
		"rev-parse",
		"--show-toplevel"
	]);
	if (gitDir && top && realOrResolved(gitDir) === commonDir) return {
		root: realOrResolved(top),
		exact: true
	};
	return {
		root: dirname(commonDir),
		exact: false
	};
}
/**
* Register (or idempotently refresh) the project containing `dir` — any checkout of it, default or
* linked. Keeps the first `registeredAt`, so re-registering from a worktree is a no-op in effect.
*/
function registerProject(ctx, input = {}) {
	const exec = ctx.exec ?? realExec;
	const dir = resolve(input.dir ?? process.cwd());
	const commonDir = commonDirOf(exec, dir);
	if (!commonDir) throw new Error(`cannot register a project at "${dir}" — not inside a git repository`);
	ctx.store.ensureMarker();
	const id = projectIdOf(commonDir);
	const existing = ctx.store.getProject(id);
	const checkout = defaultCheckoutOf(exec, dir, commonDir);
	const root = checkout.exact || !existing ? checkout.root : existing.root;
	const rec = {
		id,
		name: basename(root),
		root,
		commonDir,
		registeredAt: existing?.registeredAt ?? new Date(ctx.now?.() ?? Date.now()).toISOString()
	};
	ctx.store.putProject(rec);
	return rec;
}
function listProjects(store) {
	return store.listProjects();
}
function looksLikePath(ref) {
	return isAbsolute(ref) || ref.startsWith(".") || ref.includes(sep) || ref.includes("/");
}
function isDirectory(path) {
	return existsSync(path) && statSync(path).isDirectory();
}
/**
* Resolve a project from anywhere — by id, by a path inside any of its checkouts, or by name when
* exactly one registered project carries it. A path registers its project on first use: git has
* already confirmed it is a repository, and registering is idempotent, so there is nothing a typo
* could mint. A name never registers — nothing can be found by a name no checkout has reported —
* and an ambiguous name names its candidates rather than picking one.
*/
function resolveProject(ctx, ref) {
	const byId = ctx.store.getProject(ref);
	if (byId) return byId;
	const asPath = resolve(ref);
	if (looksLikePath(ref) && isDirectory(asPath)) return byPath(ctx, asPath);
	const named = ctx.store.listProjects().filter((p) => p.name === ref);
	if (named.length === 1) return named[0];
	if (named.length > 1) throw new Error(`project name "${ref}" is ambiguous — ${named.map((p) => `${p.id} (${p.root})`).join(", ")}; pass an id or a path`);
	if (isDirectory(asPath)) return byPath(ctx, asPath);
	throw new Error(`no registered project "${ref}" (tried id, path, and name) — pass a path inside the repository to register it`);
}
function byPath(ctx, dir) {
	const commonDir = commonDirOf(ctx.exec ?? realExec, dir);
	if (!commonDir) throw new Error(`"${dir}" is not inside a git repository`);
	return ctx.store.getProject(projectIdOf(commonDir)) ?? registerProject(ctx, { dir });
}
//#endregion
//#region src/runtime/inject-inbox.ts
const EVENTS = ["SessionStart", "PostToolUse"];
/**
* Resolve the calling agent, gather its unread mail (and a standing owner's, when this session is
* the hub's main pane), and return the SessionStart-style injection payload — or null when there is
* nothing to inject (an unregistered caller or an empty inbox never fails the harness hook).
*
* This never injects a brief. Brief delivery is the spawn wake's job: the first-turn doorbell
* carries the instruction and names the brief's file path, so pickup does not depend on this hook
* firing in the child (`unit/lifecycle`, superseding ADR-0027).
*/
function injectInbox(ctx, event) {
	if (!EVENTS.includes(event)) throw new Error(`unsupported --event "${event}" (expected ${EVENTS.join(" | ")})`);
	let meId = resolveSelfId(ctx);
	if (!meId) {
		if (currentPane(normalizeMuxEnv(ctx.env ?? process.env))) try {
			register(ctx, {});
			meId = resolveSelfId(ctx);
		} catch {
			return null;
		}
		if (!meId) return null;
	}
	const parts = [];
	const rec = loadAgent(ctx.store, meId);
	const unread = inbox({ store: ctx.store }, {
		meId,
		unread: true
	});
	if (unread.length > 0) {
		const lines = unread.map((m) => `- **${m.fromHandle}**${m.subject ? ` — ${m.subject}` : ""}: ${m.body} \`(${m.id})\``);
		parts.push(`## Unread mail (${unread.length})\n\n${lines.join("\n")}`);
	}
	const cur = currentPane(normalizeMuxEnv(ctx.env ?? process.env));
	if (rec && !rec.spawnedBy) try {
		const bound = ctx.store.getMainPane();
		if (!bound || cur?.pane === bound) {
			const standing = listAgents(ctx.store).filter((a) => a.kind === "standing");
			for (const owner of standing) {
				const ownerUnread = inbox({ store: ctx.store }, {
					meId: owner.id,
					unread: true
				});
				if (ownerUnread.length === 0) continue;
				const lines = ownerUnread.map((m) => `- **${m.fromHandle}**${m.subject ? ` — ${m.subject}` : ""}: ${m.body} \`(${m.id})\``);
				parts.push(`## Owner mail — ${owner.handle} (${ownerUnread.length})\n\n${lines.join("\n")}`);
			}
		}
	} catch {}
	if (rec && !rec.spawnedBy) try {
		if (cur ? !ctx.store.getMainPane() : !listAgents(ctx.store).some((a) => a.kind === "standing")) parts.push("## Legion setup\n\nThis pane has no owner inbox bound yet — run `cyberlegion init` to register the surfacing hook and bind this pane as the owner live presence.");
	} catch {}
	if (parts.length === 0) return null;
	return { hookSpecificOutput: {
		hookEventName: event,
		additionalContext: parts.join("\n\n")
	} };
}
//#endregion
//#region src/service.ts
/** A refused ownership transition. `stale` means the caller's generation, token, or holder claim is
* not the current one — the caller is not (or no longer) the authority it claims to be. */
var ServiceOwnershipError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "ServiceOwnershipError";
	}
};
const SERVICE_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;
function assertServiceName(name) {
	if (!SERVICE_NAME.test(name)) throw new Error(`invalid service name "${name}" — use lowercase letters, digits, "-" or "_" (max 63)`);
}
function serviceEndpointId(projectId, name) {
	return `svc-${projectId}-${name}`;
}
const nowMs = (ctx) => ctx.now?.() ?? Date.now();
const iso = (ms) => new Date(ms).toISOString();
function lockName(projectId, name) {
	return `service-${projectId}-${name}`;
}
function isLive(ctx, unit) {
	if (unit.status === "exited") return false;
	return ctx.isLive ? ctx.isLive(unit) : sessionLive(ctx, unit);
}
function ensureEndpoint(ctx, project, name) {
	const id = serviceEndpointId(project.id, name);
	const existing = loadAgent(ctx.store, id);
	if (existing) return existing;
	ctx.store.ensureMarker();
	const ts = iso(nowMs(ctx));
	const rec = {
		id,
		handle: `${name}@${project.name}`,
		kind: "service",
		service: {
			project: project.id,
			name
		},
		cwd: project.root,
		pane: null,
		status: "active",
		createdAt: ts,
		lastSeen: ts
	};
	saveAgent(ctx.store, rec);
	return rec;
}
function view(ctx, project, endpoint, lease) {
	const base = {
		project,
		endpoint,
		lease
	};
	if (lease.state === "vacant") return {
		...base,
		health: "vacant",
		control: "none"
	};
	if (lease.state === "reserved") {
		const expired = nowMs(ctx) > Date.parse(lease.reservation?.expiresAt ?? "");
		return {
			...base,
			health: expired ? "expired" : "starting",
			control: "none",
			...expired ? { note: "the reservation expired without a bound owner; the next acquire takes over" } : {}
		};
	}
	const owner = lease.holder ? loadAgent(ctx.store, lease.holder) : void 0;
	if (!owner) return {
		...base,
		health: "unhealthy",
		control: "none",
		note: "the owner has no unit record"
	};
	const control = owner.pane || ctx.store.findPaneByAgentId(owner.id) ? "pane" : "none";
	const controlNote = control === "none" ? "the owner resolves, but its session control is not recoverable from here (no multiplexer pane — e.g. a native subagent only its parent can drive)" : void 0;
	if (!isLive(ctx, owner)) return {
		...base,
		owner,
		health: "unhealthy",
		control,
		note: "the owner session is gone"
	};
	return {
		...base,
		owner,
		health: "healthy",
		control,
		...controlNote ? { note: controlNote } : {}
	};
}
function vacantLease(ctx, projectId, name) {
	return {
		project: projectId,
		service: name,
		endpoint: serviceEndpointId(projectId, name),
		generation: 0,
		state: "vacant",
		updatedAt: iso(nowMs(ctx))
	};
}
/** Load the project, service endpoint, and lease — creating the endpoint and a vacant lease when
* `create` is set, else throwing for a service that was never started. */
function load(ctx, projectRef, name, create) {
	assertServiceName(name);
	const project = resolveProject(ctx, projectRef);
	const lease = ctx.store.getServiceLease(project.id, name);
	const endpoint = loadAgent(ctx.store, serviceEndpointId(project.id, name));
	if (lease && endpoint) return {
		project,
		endpoint,
		lease
	};
	if (!create) throw new Error(`no service "${name}" in project ${project.name} (${project.id})`);
	return {
		project,
		endpoint: ensureEndpoint(ctx, project, name),
		lease: lease ?? vacantLease(ctx, project.id, name)
	};
}
/** Run `fn` on the service's current state under its lock — every ownership transition goes here. */
function transition(ctx, projectRef, name, create, fn) {
	assertServiceName(name);
	const project = resolveProject(ctx, projectRef);
	return ctx.store.withLock(lockName(project.id, name), () => fn(load(ctx, project.id, name, create)));
}
function write(ctx, lease) {
	const next = {
		...lease,
		updatedAt: iso(nowMs(ctx))
	};
	ctx.store.putServiceLease(next);
	return next;
}
function stale(message) {
	return new ServiceOwnershipError("stale", message);
}
/** Read a service's ownership without changing anything. Throws for a service never started. */
function resolveService(ctx, projectRef, name) {
	const { project, endpoint, lease } = load(ctx, projectRef, name, false);
	return view(ctx, project, endpoint, lease);
}
/**
* Contact-or-start: resolve the service's healthy owner, or reserve the right to start one. Exactly
* one of any number of concurrent callers gets `reserved`; the rest see `starting` (a start is in
* progress) or `resolved`. A vacant service, an unhealthy owner, and an expired reservation are all
* reservable, each under a new generation that fences out whatever held the old one.
*/
function acquireService(ctx, projectRef, name, input = {}) {
	return transition(ctx, projectRef, name, true, ({ project, endpoint, lease }) => {
		const current = view(ctx, project, endpoint, lease);
		if (input.force) {
			if (input.force.generation !== lease.generation) throw stale(`cannot force: generation ${input.force.generation} is not the current ${lease.generation}`);
		} else if (current.health === "healthy") return {
			outcome: "resolved",
			lease,
			view: current
		};
		else if (current.health === "starting") return {
			outcome: "starting",
			lease,
			view: current
		};
		const now = nowMs(ctx);
		const token = randomBytes(8).toString("hex");
		const next = write(ctx, {
			project: project.id,
			service: name,
			endpoint: endpoint.id,
			generation: lease.generation + 1,
			state: "reserved",
			reservation: {
				token,
				...input.by ? { by: input.by } : {},
				at: iso(now),
				expiresAt: iso(now + (input.ttlMs ?? 3e5)),
				...input.force ? { forced: true } : {}
			},
			updatedAt: iso(now)
		});
		return {
			outcome: "reserved",
			lease: next,
			view: view(ctx, project, endpoint, next),
			token
		};
	});
}
function liveUnit(ctx, id) {
	const unit = loadAgent(ctx.store, id);
	if (!unit) throw new ServiceOwnershipError("unknown-unit", `no unit "${id}"`);
	if (!isLive(ctx, unit)) throw new ServiceOwnershipError("unit-not-live", `unit "${id}" has no live session`);
	return unit;
}
/**
* Complete a reservation: make `unit` the owner at the reserved generation. Refused when the
* reservation is no longer the current one (it expired and someone else re-reserved, or it was
* released) — the starter then holds a runtime that is not the authority and must stop it. A
* reservation that expired with nobody taking over is still bindable: nothing replaced it.
*/
function bindService(ctx, projectRef, name, input) {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		if (lease.state !== "reserved" || lease.generation !== input.generation || lease.reservation?.token !== input.token) throw stale(`reservation for generation ${input.generation} is no longer current (now ${lease.state} at ${lease.generation})`);
		liveUnit(ctx, input.unit);
		return view(ctx, project, endpoint, write(ctx, {
			project: lease.project,
			service: lease.service,
			endpoint: lease.endpoint,
			generation: lease.generation,
			state: "active",
			holder: input.unit,
			updatedAt: lease.updatedAt
		}));
	});
}
/**
* Give the service up: abandon a reservation (a failed start — pass its `token`) or step down as
* owner (pass the holder `unit`). Either must match the current generation. The generation is kept;
* the next acquire bumps it.
*/
function releaseService(ctx, projectRef, name, input) {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		if (!(lease.generation === input.generation && (lease.state === "reserved" && input.token !== void 0 && lease.reservation?.token === input.token || lease.state === "active" && input.unit !== void 0 && lease.holder === input.unit))) throw stale(`nothing to release at generation ${input.generation} (now ${lease.state} at ${lease.generation})`);
		return view(ctx, project, endpoint, write(ctx, {
			project: lease.project,
			service: lease.service,
			endpoint: lease.endpoint,
			generation: lease.generation,
			state: "vacant",
			updatedAt: lease.updatedAt
		}));
	});
}
/**
* Transfer ownership from the current holder to another live unit, under a new generation. Only the
* holder at the current generation can hand off, and afterwards it is stale.
*/
function handoffService(ctx, projectRef, name, input) {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		if (lease.state !== "active" || lease.generation !== input.generation || lease.holder !== input.from) throw stale(`"${input.from}" is not the owner at generation ${input.generation}`);
		liveUnit(ctx, input.to);
		return view(ctx, project, endpoint, write(ctx, {
			...lease,
			generation: lease.generation + 1,
			holder: input.to
		}));
	});
}
/**
* The fencing check: succeed only when `unit` owns the service at exactly `generation`. A runtime
* calls this before acting as the service's authority; a stale runtime — replaced, handed off, or
* recovered past — is refused.
*/
function verifyOwnership(ctx, projectRef, name, input) {
	const { project, endpoint, lease } = load(ctx, projectRef, name, false);
	if (lease.state !== "active" || lease.holder !== input.unit || lease.generation !== input.generation) throw stale(`"${input.unit}" at generation ${input.generation} is not the owner (now ${lease.state}${lease.holder ? ` by ${lease.holder}` : ""} at ${lease.generation})`);
	return view(ctx, project, endpoint, lease);
}
/**
* Resolve-or-start end to end: acquire, and only when this caller wins the reservation, launch a
* runtime and bind it. A launch that throws releases the reservation (best-effort — an expiry covers
* a release that itself fails) so the start is retryable at once. A launch that finishes after its
* reservation was superseded is refused at bind: the launched unit is not the owner, and the error
* names it so the caller can stop it.
*/
async function startService(ctx, projectRef, name, input) {
	const acquired = acquireService(ctx, projectRef, name, input);
	if (acquired.outcome !== "reserved") return {
		outcome: acquired.outcome,
		view: acquired.view
	};
	const { generation, endpoint } = acquired.lease;
	let launched;
	try {
		launched = await input.launch({
			generation,
			endpoint
		});
	} catch (err) {
		try {
			releaseService(ctx, projectRef, name, {
				generation,
				token: acquired.token
			});
		} catch {}
		throw err;
	}
	try {
		return {
			outcome: "started",
			view: bindService(ctx, projectRef, name, {
				generation,
				token: acquired.token,
				unit: launched.unit
			}),
			launched
		};
	} catch (err) {
		if (err instanceof ServiceOwnershipError) throw new ServiceOwnershipError(err.code, `launched unit "${launched.unit}" could not become the owner — ${err.message}; stop it`);
		throw err;
	}
}
//#endregion
//#region src/store/errors.ts
/** A record file exists but its content didn't parse as JSON — a torn write (crash mid-`writeFileSync`,
* pre-atomic-write code path) or on-disk tampering. Carries the file path and the original parse
* error so a caller can report exactly what's broken and where, rather than "Unexpected token" with
* no location. */
var CorruptRecordError = class extends Error {
	file;
	constructor(file, cause) {
		super(`corrupt record at "${file}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
		this.file = file;
		this.name = "CorruptRecordError";
	}
};
//#endregion
//#region src/store/process-liveness.ts
/**
* Probe whether `pid` is alive using `process.kill(pid, 0)` — the POSIX "does this process exist"
* idiom; it sends no signal, it only tests deliverability. `ESRCH` (no such process) is the only
* errno that means "definitely dead". Every other errno — `EPERM` above all, common under sandboxes
* and containers where a genuinely live process can be unsignalable by this one, or any process
* owned by a different uid — reads as `'unknown'`, never `'dead'`: collapsing `EPERM` into "dead" is
* exactly the defect this three-state return exists to make structurally impossible to reintroduce
* at a new call site. Same-pid is trivially `'alive'` (a process checking its own prior identity,
* e.g. after a crash-and-restart that reused nothing).
*/
function probeProcess(pid) {
	if (pid === process.pid) return "alive";
	try {
		process.kill(pid, 0);
		return "alive";
	} catch (err) {
		return err.code === "ESRCH" ? "dead" : "unknown";
	}
}
//#endregion
//#region src/store/lock.ts
var LockTimeoutError = class extends Error {
	name;
	constructor(name) {
		super(`timed out waiting for lock "${name}"`);
		this.name = name;
		this.name = "LockTimeoutError";
	}
};
function locksDir(root) {
	return join(root, "locks");
}
function lockDirFor(root, name) {
	return join(locksDir(root), `${name}.lock`);
}
/** Read a lock dir's recorded holder. Absent/corrupt/mid-acquire (holder.json not written yet) all
* read as "unknown" — never grounds to steal. An ambiguous read must never look like a green light. */
function readHolder(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, "holder.json"), "utf8"));
	} catch {
		return;
	}
}
/** Locking's policy on `probeProcess`'s `'unknown'` state: treat it exactly like `'alive'` — i.e.
* NOT `'dead'`. The one invariant that must never break here is stealing a lock a live holder still
* holds, and `'unknown'` means "cannot rule out alive", so it can only ever be safe to fold it into
* the "do not steal" side. This is a local policy decision, not `probeProcess`'s — a different call
* site (a staleness reaper, say) folding `'unknown'` into "not provably alive" instead would be
* reading the SAME three states toward the opposite default, which is exactly the bug class this
* three-state type exists to force each call site to decide explicitly (see process-liveness.ts). */
function heldByLiveOrUnknownPid(pid) {
	return probeProcess(pid) !== "dead";
}
function sleepSync(ms) {
	if (ms <= 0) return;
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
/**
* Attempt to reclaim an abandoned lock dir without ever discarding a LIVE one out from under its
* holder — the exact defect agmsg/firstmate's lock suites exist to catch (evidence.md items 3-4).
*
* `mkdirSync` on the lock path itself already arbitrates ordinary contention (EEXIST = someone else
* got there first); the harder race is a STEAL: two processes independently deciding the same lock
* looks dead. `renameSync` gives the same exclusivity `mkdirSync` gives for a fresh path, but for an
* EXISTING one — of any number of processes racing to rename the SAME source path away, exactly one
* succeeds and the rest get ENOENT. So the rename-away is the sole arbiter of "who gets to attempt
* the steal", not the earlier staleness read.
*
* That still leaves one race: the content we read as stale might not be the content we actually
* capture, if the true holder released and a NEW, live holder re-acquired at this same path between
* our staleness read and our rename. So after winning the rename, re-check the pid we ACTUALLY
* captured (not the one from the earlier read) — if it's alive, this was a live lock we grabbed by
* accident; put it back immediately (best-effort — if a third party has since re-mkdir'd the path,
* the invariant we're protecting already holds, so just drop our capture) and refuse to finalize.
*/
function tryReclaimStale(dir) {
	const grave = `${dir}.stale-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	try {
		renameSync(dir, grave);
	} catch (err) {
		if (err.code === "ENOENT") return false;
		throw err;
	}
	const captured = readHolder(grave);
	if (captured && heldByLiveOrUnknownPid(captured.pid)) {
		try {
			renameSync(grave, dir);
		} catch {
			rmSync(grave, {
				recursive: true,
				force: true
			});
		}
		return false;
	}
	rmSync(grave, {
		recursive: true,
		force: true
	});
	return true;
}
/**
* Acquire an advisory, mkdir-based lock at `root/locks/<name>.lock`. mkdir (not O_EXCL on a file) is
* the primitive here because a lock also needs to carry its holder metadata (pid + timestamp) for
* staleness detection, and a directory gives that a natural home (`holder.json` inside it) without a
* second file to keep in sync; `mkdirSync` on a non-existent path is exactly as atomic as an
* exclusive file create on every filesystem this tool targets (POSIX; NTFS via Node's Win32 mkdir).
*
* Blocks (busy-retries) until acquired or `timeoutMs` elapses, reclaiming a dead holder's lock along
* the way (see `tryReclaimStale`) but NEVER a live one — contention with a live holder always waits
* it out or times out, never steals.
*/
function acquireLock(root, name, opts = {}) {
	const retryDelayMs = opts.retryDelayMs ?? 20;
	const timeoutMs = opts.timeoutMs ?? 5e3;
	const dir = lockDirFor(root, name);
	mkdirSync(locksDir(root), { recursive: true });
	const deadline = Date.now() + timeoutMs;
	for (;;) try {
		mkdirSync(dir);
		writeFileSync(join(dir, "holder.json"), JSON.stringify({
			pid: process.pid,
			acquiredAt: Date.now()
		}));
		return { release: () => rmSync(dir, {
			recursive: true,
			force: true
		}) };
	} catch (err) {
		if (err.code !== "EEXIST") throw err;
		const holder = readHolder(dir);
		if (holder && !heldByLiveOrUnknownPid(holder.pid) && tryReclaimStale(dir)) continue;
		if (Date.now() > deadline) throw new LockTimeoutError(name);
		sleepSync(retryDelayMs);
	}
}
/** Acquire `name`, run `fn`, and always release — the shape every genuine read-modify-write in the
* store should use (`setMainPane`, `identity.ts`'s `claimPresence`/`clearPresence` today). */
function withLock(root, name, fn, opts) {
	const handle = acquireLock(root, name, opts);
	try {
		return fn();
	} finally {
		handle.release();
	}
}
//#endregion
//#region src/store/file-store.ts
/** Parse a record file's content, wrapping a `JSON.parse` failure in a typed, file-named
* `CorruptRecordError` instead of letting a bare `SyntaxError` bubble up from deep inside
* `listInbox`/`listAgents`/`getAgent` with no indication of WHICH file broke. A file that doesn't
* exist is a caller error — callers check existence first, so this only ever sees files known to
* be present but possibly torn (a crash mid-write predating the atomic-write fix, or on-disk
* tampering) — see evidence.md item 5, "no silent success on a broken store". */
function readJsonRecord(file) {
	const raw = readFileSync(file, "utf8");
	try {
		return JSON.parse(raw);
	} catch (err) {
		throw new CorruptRecordError(file, err);
	}
}
function readMessages(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJsonRecord(join(dir, f)));
}
/** Write `data` to `file` crash-safely: write to a sibling temp file first, then `renameSync` into
* place. `rename` is atomic within a filesystem (POSIX guarantees this; Node's Win32 rename is too
* for same-volume paths, which every path here is — always under the same store root), so any
* reader either sees the OLD complete content or the NEW complete content, never a truncated
* in-between. Before this fix, `putMessage`/`putAgent`/`putPaneIndex`/`setMainPane` called
* `writeFileSync` directly on the final path — only `ackMessage`'s move (a rename of an already-
* complete file) was atomic. A process crashing mid-`writeFileSync`, or a reader racing a writer on
* a large record, could hand `JSON.parse` a truncated file and throw an uncaught `SyntaxError` deep
* inside `listInbox`/`listAgents`/`getAgent`.
*
* Deliberately no `fsync` before the rename: this tool defends against a process CRASHING mid-write
* (the actual, observed risk in a daemonless multi-process CLI), where the page cache alone is
* sufficient, not against a power-loss/OS-crash losing unflushed pages, which cyberlegion doesn't
* claim to survive today (no writer here holds data the user can't just re-send). Add fsync if that
* durability bar ever changes.
*
* The temp name embeds pid + a counter so two writers to the SAME final path never collide on their
* own temp files mid-write (each writer's temp file is unique to it). */
let tmpCounter = 0;
function writeFileAtomic(file, data) {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${tmpCounter++}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, file);
}
function writeJson(file, data) {
	writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
}
function writeText(file, text) {
	writeFileAtomic(file, text);
}
/** Build a path via `build()` for a READ-only lookup, treating a syntactically-invalid id
* (`InvalidIdError`) the same as "not found" rather than throwing. Reads are the wrong place to
* enforce id-shape: `resolveAgent`/`resolveRecipient` (identity.ts) speculatively probe an arbitrary
* ref — which may legitimately be a worktree BRANCH NAME containing `/` — as a candidate id before
* falling back to handle/branch lookup, so `getAgent('cyberlegion/unit-abc')` must fail soft, not
* throw, or that fallback chain breaks. The traversal risk this guards against (an id escaping the
* store root) only bites on a WRITE — nothing is ever created or overwritten by a probe that finds
* nothing — so a hard reject stays reserved for the write paths below (`putAgent`, `putMessage`,
* `putPaneIndex`, `writeBrief`), where a malformed id would otherwise put a stray file wherever it
* pointed. */
function readPathOrUndefined(build) {
	try {
		return build();
	} catch (err) {
		if (err instanceof InvalidIdError) return void 0;
		throw err;
	}
}
/** The on-disk `Store` implementation — current per-writer sharded `.json` layout (ADR-0020):
* one file per message/agent, collision-free filenames, ack = atomic rename into `read/`. */
var FileStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	ensureMarker() {
		ensureMarker(this.root);
	}
	putMessage(toId, msg) {
		writeFileAtomic(paths.messageFile(this.root, toId, msg.id), `${JSON.stringify(msg, null, 2)}\n`);
	}
	listInbox(id) {
		const inbox = readPathOrUndefined(() => paths.inboxDir(this.root, id));
		const read = readPathOrUndefined(() => paths.inboxReadDir(this.root, id));
		return {
			unread: inbox ? readMessages(inbox) : [],
			read: read ? readMessages(read) : []
		};
	}
	ackMessage(id, msgId) {
		const src = readPathOrUndefined(() => paths.messageFile(this.root, id, msgId));
		if (!src || !existsSync(src)) throw new Error(`"${msgId}" is not an unread message in this inbox`);
		const msg = readJsonRecord(src);
		const dest = paths.messageReadFile(this.root, id, msgId);
		mkdirSync(dirname(dest), { recursive: true });
		renameSync(src, dest);
		return msg;
	}
	removeMessage(id, msgId) {
		const unreadFile = readPathOrUndefined(() => paths.messageFile(this.root, id, msgId));
		if (unreadFile && existsSync(unreadFile)) {
			rmSync(unreadFile);
			return;
		}
		const readFile = readPathOrUndefined(() => paths.messageReadFile(this.root, id, msgId));
		if (readFile && existsSync(readFile)) {
			rmSync(readFile);
			return;
		}
		throw new Error(`"${msgId}" is not a message in this inbox`);
	}
	putAgent(rec) {
		writeJson(paths.agentFile(this.root, rec.id), rec);
	}
	getAgent(id) {
		const file = readPathOrUndefined(() => paths.agentFile(this.root, id));
		if (!file || !existsSync(file)) return void 0;
		return readJsonRecord(file);
	}
	listAgents() {
		const dir = paths.agentsDir(this.root);
		if (!existsSync(dir)) return [];
		return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJsonRecord(join(dir, f))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}
	removeAgent(id) {
		rmSync(paths.agentFile(this.root, id), { force: true });
	}
	removeAgentData(id) {
		rmSync(paths.dataDir(this.root, id), {
			recursive: true,
			force: true
		});
	}
	putProject(rec) {
		writeJson(paths.projectFile(this.root, rec.id), rec);
	}
	getProject(id) {
		const file = readPathOrUndefined(() => paths.projectFile(this.root, id));
		if (!file || !existsSync(file)) return void 0;
		return readJsonRecord(file);
	}
	listProjects() {
		const dir = paths.projectsDir(this.root);
		if (!existsSync(dir)) return [];
		return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJsonRecord(join(dir, f))).sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
	}
	putServiceLease(lease) {
		writeJson(paths.serviceLeaseFile(this.root, lease.project, lease.service), lease);
	}
	getServiceLease(project, service) {
		const file = readPathOrUndefined(() => paths.serviceLeaseFile(this.root, project, service));
		if (!file || !existsSync(file)) return void 0;
		return readJsonRecord(file);
	}
	putPaneIndex(pane, agentId) {
		writeText(paths.paneFile(this.root, pane), agentId);
	}
	resolvePaneId(pane) {
		const file = paths.paneFile(this.root, pane);
		return existsSync(file) ? readFileSync(file, "utf8").trim() : void 0;
	}
	findPaneByAgentId(agentId) {
		const dir = paths.panesDir(this.root);
		if (!existsSync(dir)) return void 0;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith(".id")) continue;
			if (readFileSync(join(dir, f), "utf8").trim() === agentId) return f.slice(0, -3);
		}
	}
	removePaneIndex(pane) {
		rmSync(paths.paneFile(this.root, pane), { force: true });
	}
	writeBrief(agentId, text) {
		writeText(paths.briefFile(this.root, agentId), text);
	}
	readBrief(agentId) {
		const file = readPathOrUndefined(() => paths.briefFile(this.root, agentId));
		return file && existsSync(file) ? readFileSync(file, "utf8") : void 0;
	}
	setMainPane(pane) {
		withLock(this.root, "main-pane", () => {
			const file = paths.mainPaneFile(this.root);
			if (pane) {
				writeText(file, pane);
				return;
			}
			rmSync(file, { force: true });
		});
	}
	getMainPane() {
		const file = paths.mainPaneFile(this.root);
		return existsSync(file) ? readFileSync(file, "utf8").trim() : void 0;
	}
	withLock(name, fn) {
		return withLock(this.root, name, fn);
	}
};
//#endregion
//#region src/wake/await.ts
/** Internal poll interval — not user-facing (the round-trip cost of one `mail await` cycle). */
const POLL_MS$1 = 1e3;
const DEFAULT_TIMEOUT_MS = 6e5;
const DEFAULT_MAX_WAIT_S = 240;
/**
* Block on the caller's UNREAD inbox until a message matching `thread` (and optional `from`)
* arrives, polling on a fixed ~1s internal interval. Three unambiguous outcomes:
*
* - `matched` — a message arrived; it is printed by the caller AND acked here (moved to read/), so
*   it leaves the unread set. Block-then-read: each await consumes exactly its round.
* - `waiting` — this call's internal poll cycle hit its `maxWaitS` cap (default 240s, always well
*   under a harness tool-timeout SIGKILL) with no match yet. A clean, non-error return the caller
*   re-arms on (calls `awaitReply` again) — NOT the same as giving up.
* - `timed-out` — the caller's overall `timeoutMs` (default 600_000ms / 600s; `0` = wait forever)
*   elapsed across re-arms with no match. The caller should exit non-zero.
*/
async function awaitReply(ctx, input) {
	const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxWaitMs = (input.maxWaitS ?? DEFAULT_MAX_WAIT_S) * 1e3;
	const now = input.now ?? (() => Date.now());
	const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	const start = now();
	const cycleDeadline = start + maxWaitMs;
	for (;;) {
		const items = inbox(ctx, {
			meId: input.meId,
			unread: true,
			thread: input.thread,
			from: input.from
		});
		if (items.length > 0) {
			const message = items[0];
			ack(ctx, input.meId, message.id);
			return {
				kind: "matched",
				message
			};
		}
		const elapsed = now() - start;
		if (timeoutMs !== 0 && elapsed >= timeoutMs) return { kind: "timed-out" };
		if (now() >= cycleDeadline) return { kind: "waiting" };
		await sleep(POLL_MS$1);
	}
}
//#endregion
//#region src/wake/watch.ts
const POLL_MS = 1e3;
/**
* A continuous foreground observer: prints each NEW matching message as it arrives, polling on a
* fixed ~1s interval, until interrupted (or `maxIterations` in tests). Never acks — a message
* `watch` prints stays unread and still surfaces later in `mail inbox`/`mail await`.
*/
async function watchMail(ctx, input, onMessage, opts = {}) {
	const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	const seen = /* @__PURE__ */ new Set();
	for (const m of inbox(ctx, {
		meId: input.meId,
		thread: input.thread,
		from: input.from
	})) seen.add(m.id);
	let iterations = 0;
	for (;;) {
		const items = inbox(ctx, {
			meId: input.meId,
			thread: input.thread,
			from: input.from
		});
		for (const m of items) {
			if (seen.has(m.id)) continue;
			seen.add(m.id);
			onMessage(m);
		}
		iterations++;
		if (opts.maxIterations != null && iterations >= opts.maxIterations) return;
		await sleep(POLL_MS);
	}
}
//#endregion
//#region src/cli.ts
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
function ctxOf(opts) {
	return {
		store: new FileStore(resolveRoot({ space: opts.space })),
		env: process.env
	};
}
function formatOf(opts) {
	return opts.format === "json" ? "json" : "toon";
}
function requireSelf(ctx) {
	const id = resolveSelfId(ctx);
	if (!id) fail("no identity in this session — run `cyberlegion unit register` first");
	bumpLastSeen(ctx, id);
	return id;
}
function withGlobals(cmd) {
	return cmd.option("--space <path>", "isolate the hub root (overrides the global hub / $CYBERLEGION_ROOT)").addOption(new Option("--format <format>", "output format").choices(["toon", "json"]).default("toon"));
}
const program = new Command();
program.name("cyberlegion").description("Harness-agnostic agent session spawning and messaging over the filesystem").version(VERSION).enablePositionalOptions();
const unit = program.command("unit").description("legion units — register, discover, spawn, and reap");
/** The standing-owner branch of `unit register --standing` (folds the old `identity owner`). */
function runStanding(ctx, opts) {
	if (!opts.handle) {
		const standing = listAgents(ctx.store).filter((a) => a.kind === "standing");
		emit(formatOf(opts), {
			toon: toonList("agents", standing, [
				{
					key: "id",
					get: (a) => a.id
				},
				{
					key: "handle",
					get: (a) => a.handle
				},
				{
					key: "harness",
					get: (a) => a.harness ?? "-"
				},
				{
					key: "status",
					get: (a) => a.status
				}
			], `${standing.length} standing`),
			json: standing
		});
		return;
	}
	const liveClaim = listAgents(ctx.store).find((a) => a.handle === opts.handle && a.kind !== "standing" && a.status !== "exited");
	const rec = registerStanding(ctx, { handle: opts.handle });
	if (liveClaim) console.error(`a live session already claims handle "${opts.handle}"`);
	emit(formatOf(opts), {
		toon: toonObject({
			id: rec.id,
			handle: rec.handle,
			kind: rec.kind,
			status: rec.status
		}),
		json: rec
	});
}
withGlobals(unit.command("register")).description("register or refresh this session identity (or --standing: a session-independent owner inbox)").option("--handle <name>", "human handle for this agent").option("--harness <h>", "claude | cursor | codex (else auto-detected)").option("--standing", "mint a standing, session-independent owner inbox (bare, with no --handle: list them)").action((opts) => {
	const ctx = ctxOf(opts);
	if (opts.standing) {
		runStanding(ctx, opts);
		return;
	}
	const rec = register(ctx, {
		handle: opts.handle,
		harness: opts.harness
	});
	emit(formatOf(opts), {
		toon: toonObject({
			id: rec.id,
			handle: rec.handle,
			harness: rec.harness ?? "-",
			status: rec.status
		}),
		json: rec
	});
});
withGlobals(unit.command("claim")).description("bind the caller's unit as a standing owner's presence; --show reads it, --clear unbinds").argument("<handle>", "standing owner handle").option("--clear", "unbind the presence (a no-op when nothing is bound)").option("--show", "print the bound presence instead of claiming").action((handle, opts) => {
	const ctx = ctxOf(opts);
	if (opts.show) {
		let presence;
		try {
			presence = resolvePresence(ctx.store, handle);
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err));
		}
		emit(formatOf(opts), {
			toon: toonObject({ presence: presence?.id ?? "none" }),
			json: { presence: presence?.id ?? null }
		});
		return;
	}
	if (opts.clear) {
		try {
			clearPresence(ctx, handle);
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err));
		}
		emit(formatOf(opts), {
			toon: toonObject({ presence: "none" }),
			json: { presence: null }
		});
		return;
	}
	let rec;
	try {
		rec = claimPresence(ctx, handle);
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject({
			owner: rec.handle,
			presence: rec.presence
		}),
		json: {
			owner: rec.handle,
			presence: rec.presence
		}
	});
});
withGlobals(unit.command("whoami")).description("print this session own identity").action((opts) => {
	const ctx = ctxOf(opts);
	const id = resolveSelfId(ctx);
	if (!id) fail("no identity in this session — run `cyberlegion unit register` first");
	const rec = loadAgent(ctx.store, id);
	if (!rec) fail(`registered self id "${id}" has no agent record`);
	emit(formatOf(opts), {
		toon: toonObject({
			id: rec.id,
			handle: rec.handle,
			harness: rec.harness ?? "-",
			status: rec.status
		}),
		json: rec
	});
});
function runWho(opts) {
	const ctx = ctxOf(opts);
	touch(ctx);
	if (opts.reconcile) reconcile(ctx, { adopt: true });
	const agents = listAgents(ctx.store).filter((a) => opts.all || a.status !== "exited");
	emit(formatOf(opts), {
		toon: toonList("units", agents, [
			{
				key: "id",
				get: (a) => a.id
			},
			{
				key: "handle",
				get: (a) => a.handle
			},
			{
				key: "harness",
				get: (a) => a.harness ?? "-"
			},
			{
				key: "status",
				get: (a) => a.status
			},
			{
				key: "pane",
				get: (a) => a.pane?.id ?? "-"
			}
		], `${agents.length} units`),
		json: agents
	});
	if (agents.length === 0) nextStep("cyberlegion unit register to join");
}
withGlobals(unit.command("who")).description("list the addressable units").option("--all", "include exited units").option("--reconcile", "live-probe the current mux: cull dead-pane records and adopt unbound harness-bearing panes before listing").action(runWho);
withGlobals(unit.command("prune")).description("mark dead units exited and sweep").action((opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const changed = prune(ctx);
	emit(formatOf(opts), {
		toon: toonList("pruned", changed, [{
			key: "id",
			get: (a) => a.id
		}, {
			key: "handle",
			get: (a) => a.handle
		}], `${changed.length} pruned`),
		json: changed
	});
});
/** What a model/effort/harness field reads when no source set it and the harness's own default applies. */
const HARNESS_DEFAULT = "(harness default)";
/** The launch options `unit spawn` and `service start` share. */
function withSpawnOptions(cmd) {
	return withGlobals(cmd).option("--harness <h>", "claude | cursor | codex (required unless --agent/--agent-file resolves one)").option("--agent <name>", "resolve an agent def (.agents/agents/<name>.md) for harness/model/effort/instructions").option("--agent-file <path>", "read an exact agent def file instead of resolving by name").option("--model <name>", "model for this launch only (flag > agent def > harness default)").option("--effort <level>", "effort for this launch only (flag > agent def > harness default)").option("--task <text>", "brief text, or - for stdin").option("--brief-file <path>", "read the brief from a file").option("--handle <name>", "handle for the new peer").option("--branch <name>", "branch for the new worktree (default cyberlegion/unit-<id>)").option("--worktree-path <path>", "where to check out the new worktree").option("--cwd <path>", "spawn the session in an existing directory; create no worktree (mutually exclusive with --branch/--worktree-path)").addOption(new Option("--at <placement>", "where to open the new session (default: new-worktree → workspace, --cwd → tab)").choices([
		"pane:right",
		"pane:down",
		"tab",
		"workspace"
	])).option("--no-wake", "suppress the first-turn doorbell (spawn idle; the caller drives the first turn itself)");
}
function defineSpawn(cmd) {
	return withSpawnOptions(cmd).description("launch a new peer session in its own git worktree (tmux or herdr)").action(async (opts) => {
		const ctx = ctxOf(opts);
		touch(ctx);
		let spawnInput;
		try {
			spawnInput = spawnCommandInput(opts);
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err));
		}
		const res = await spawnAndWake(ctx, spawnInput.input, { noWake: spawnInput.noWake });
		if (res.warning) console.error(`first-turn doorbell not confirmed (peer still spawned; nudge it manually): ${res.warning}`);
		emit(formatOf(opts), {
			toon: toonObject({
				spawned: res.agent.id,
				handle: res.agent.handle,
				harness: res.agent.harness,
				model: spawnInput.launched.model ?? HARNESS_DEFAULT,
				effort: spawnInput.launched.effort ?? HARNESS_DEFAULT,
				worktree: res.agent.worktree?.root,
				pane: res.pane,
				rung: res.rung
			}),
			json: {
				agent: res.agent,
				pane: res.pane,
				launch: res.launch,
				model: spawnInput.launched.model ?? HARNESS_DEFAULT,
				effort: spawnInput.launched.effort ?? HARNESS_DEFAULT,
				rung: res.rung
			}
		});
		nextStep(`cyberlegion unit read ${res.agent.id}`);
	});
}
defineSpawn(unit.command("spawn"));
withGlobals(unit.command("close")).description("tear down a unit's worktree + session and reap its state (the inverse of spawn)").argument("<id>", "unit id, handle, or worktree branch/CR ref").option("--force", "discard uncommitted changes in the worktree (never overrides refusing the primary checkout)").option("--keep-worktree", "leave the worktree on disk for reuse and reap everything else (skips the dirty check; never overrides refusing the primary checkout)").action((ref, opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const agent = resolveAgent(ctx.store, ref);
	const res = decommission(ctx, {
		id: agent.id,
		force: opts.force,
		keepWorktree: opts.keepWorktree
	});
	emit(formatOf(opts), {
		toon: toonObject({
			closed: agent.id,
			worktree: res.worktreeRoot ?? "-",
			retained: res.retainedWorktree ?? "-",
			pane: res.pane ?? "-"
		}),
		json: res
	});
});
withGlobals(unit.command("focus")).description("move input focus to a peer's session").argument("<ref>", "unit id, handle, or worktree branch/CR ref").action((ref, opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const { pane } = focusUnit(ctx, ref);
	emit(formatOf(opts), {
		toon: toonObject({
			focused: ref,
			pane
		}),
		json: {
			ref,
			pane
		}
	});
});
withGlobals(unit.command("nudge")).description("ring a peer's session (a doorbell that tells them to check their mail)").argument("<ref>", "unit id, handle, or worktree branch/CR ref").option("--message <text>", "the doorbell text delivered to the peer session", DELIVERY_DOORBELL).action(async (ref, opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const { pane, message, resubmits } = await nudgeUnit(ctx, ref, { message: opts.message });
	emit(formatOf(opts), {
		toon: toonObject({
			nudged: ref,
			pane
		}),
		json: {
			ref,
			pane,
			message,
			resubmits
		}
	});
});
withGlobals(unit.command("read")).description("scrape a peer's session screen").argument("<ref>", "unit id, handle, or worktree branch/CR ref").option("--lines <n>", "trailing lines to capture", (v) => Number.parseInt(v, 10)).action((ref, opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const { pane, output } = readUnit(ctx, ref, { lines: opts.lines });
	console.log(readCommandOutput(formatOf(opts), {
		ref,
		pane,
		output
	}));
});
withGlobals(unit.command("clear")).description("reset a warm peer's context to cold by injecting its own harness fresh-context command — keeps the pane/session warm; tears down nothing").argument("<ref>", "unit id, handle, or worktree branch/CR ref").action((ref, opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	let res;
	try {
		res = clearUnit(ctx, ref);
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject({
			cleared: ref,
			pane: res.pane,
			command: res.command
		}),
		json: {
			cleared: ref,
			pane: res.pane,
			command: res.command
		}
	});
});
const project = program.command("project").description("register and resolve projects (one per git repository)");
function projectFields(p) {
	return {
		id: p.id,
		name: p.name,
		root: p.root
	};
}
withGlobals(project.command("register")).description("register (or refresh) the project containing a directory — any checkout of it").option("--dir <path>", "a directory inside the project (default: the current directory)").action((opts) => {
	const ctx = ctxOf(opts);
	let rec;
	try {
		rec = registerProject({ store: ctx.store }, { dir: opts.dir });
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject(projectFields(rec)),
		json: rec
	});
});
withGlobals(project.command("list")).description("list the registered projects").action((opts) => {
	const projects = listProjects(ctxOf(opts).store);
	emit(formatOf(opts), {
		toon: toonList("projects", projects, [
			{
				key: "id",
				get: (p) => p.id
			},
			{
				key: "name",
				get: (p) => p.name
			},
			{
				key: "root",
				get: (p) => p.root
			}
		], `${projects.length} projects`),
		json: projects
	});
	if (projects.length === 0) nextStep("cyberlegion project register to add the current repository");
});
withGlobals(project.command("show")).description("resolve a registered project by id, path, or unique name").argument("<ref>", "project id, a path inside any of its checkouts, or its name").action((ref, opts) => {
	const ctx = ctxOf(opts);
	let rec;
	try {
		rec = resolveProject({ store: ctx.store }, ref);
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject(projectFields(rec)),
		json: rec
	});
});
const service = program.command("service").description("project services — one authoritative owner each, fenced by generation");
function serviceFields(v) {
	return {
		project: v.project.id,
		service: v.lease.service,
		endpoint: v.endpoint.id,
		generation: v.lease.generation,
		state: v.lease.state,
		holder: v.lease.holder ?? null,
		health: v.health,
		control: v.control,
		...v.note ? { note: v.note } : {}
	};
}
function toonFields(fields) {
	return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? "-"]));
}
function emitService(opts, fields) {
	emit(formatOf(opts), {
		toon: toonObject(toonFields(fields)),
		json: fields
	});
}
/** Run a service operation, rendering any refusal through `fail` (stderr + non-zero exit). */
function orFail(fn) {
	try {
		return fn();
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
}
const generationOf = (v) => Number.parseInt(v, 10);
/** `service <verb> [project] <name>`: with one argument it is the name, and the project is the one
* containing the current directory (registered on first use, like any path). */
function serviceTarget(first, second) {
	return second === void 0 ? [".", first] : [first, second];
}
/** A unit reference option, defaulting to the calling session's own identity. */
function unitOrSelf(ctx, ref) {
	return ref ? orFail(() => resolveAgent(ctx.store, ref)).id : requireSelf(ctx);
}
withGlobals(service.command("resolve")).description("show a service's owner, generation, health, and whether its session is controllable").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	emitService(opts, serviceFields(orFail(() => resolveService(ctx, projectRef, name))));
});
withGlobals(service.command("acquire")).description("resolve the healthy owner, or reserve the right to start one (exactly one caller wins)").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").option("--ttl <ms>", "how long the reservation holds before another caller may take over", generationOf).option("--force-generation <n>", "reserve even over a healthy owner — must name the current generation", generationOf).action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	const res = orFail(() => acquireService(ctx, projectRef, name, {
		by: resolveSelfId(ctx),
		ttlMs: opts.ttl,
		...opts.forceGeneration !== void 0 ? { force: { generation: opts.forceGeneration } } : {}
	}));
	emitService(opts, {
		outcome: res.outcome,
		...serviceFields(res.view),
		...res.outcome === "reserved" ? {
			token: res.token,
			expiresAt: res.lease.reservation?.expiresAt
		} : {}
	});
	if (res.outcome === "reserved") nextStep(`start the runtime, then: cyberlegion service bind ${projectRef} ${name} --generation ${res.lease.generation} --token ${res.token}`);
	else if (res.outcome === "starting") nextStep(`another caller is starting it — re-run to resolve: cyberlegion service resolve ${projectRef} ${name}`);
});
withGlobals(service.command("bind")).description("complete a reservation: make a live unit (default: this session) the owner").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").requiredOption("--generation <n>", "the reserved generation", generationOf).requiredOption("--token <token>", "the reservation token from acquire").option("--unit <ref>", "the unit to bind (default: this session)").action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	const unitId = unitOrSelf(ctx, opts.unit);
	emitService(opts, serviceFields(orFail(() => bindService(ctx, projectRef, name, {
		generation: opts.generation,
		token: opts.token,
		unit: unitId
	}))));
});
withGlobals(service.command("release")).description("abandon a reservation (--token) or step down as owner (default: this session)").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").requiredOption("--generation <n>", "the current generation", generationOf).option("--token <token>", "release a reservation instead of an active ownership").option("--unit <ref>", "the owning unit (default: this session)").action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	const input = opts.token ? {
		generation: opts.generation,
		token: opts.token
	} : {
		generation: opts.generation,
		unit: unitOrSelf(ctx, opts.unit)
	};
	emitService(opts, serviceFields(orFail(() => releaseService(ctx, projectRef, name, input))));
});
withGlobals(service.command("handoff")).description("transfer ownership to another live unit under a new generation").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").requiredOption("--generation <n>", "the current generation", generationOf).requiredOption("--to <ref>", "the unit taking over").option("--from <ref>", "the current owner (default: this session)").action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	const from = unitOrSelf(ctx, opts.from);
	const to = orFail(() => resolveAgent(ctx.store, opts.to)).id;
	emitService(opts, serviceFields(orFail(() => handoffService(ctx, projectRef, name, {
		generation: opts.generation,
		from,
		to
	}))));
});
withGlobals(service.command("verify")).description("the fencing check: exit 0 only when the unit (default: this session) owns the service at this generation").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").requiredOption("--generation <n>", "the generation the caller believes it owns", generationOf).option("--unit <ref>", "the unit to check (default: this session)").action((first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	const unitId = unitOrSelf(ctx, opts.unit);
	emitService(opts, serviceFields(orFail(() => verifyOwnership(ctx, projectRef, name, {
		unit: unitId,
		generation: opts.generation
	}))));
});
withSpawnOptions(service.command("start")).description("resolve the healthy owner, or spawn one peer and bind it — concurrent starts launch once").argument("<project-or-name>", "project id, path, or unique name — omit to use the current directory").argument("[name]", "service name").option("--ttl <ms>", "how long the reservation holds while the peer launches", generationOf).action(async (first, second, opts) => {
	const [projectRef, name] = serviceTarget(first, second);
	const ctx = ctxOf(opts);
	touch(ctx);
	let spawnInput;
	try {
		spawnInput = spawnCommandInput(opts);
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	let warning;
	let res;
	try {
		res = await startService(ctx, projectRef, name, {
			by: resolveSelfId(ctx),
			ttlMs: opts.ttl,
			launch: async () => {
				const spawned = await spawnAndWake(ctx, spawnInput.input, { noWake: spawnInput.noWake });
				warning = spawned.warning;
				return {
					unit: spawned.agent.id,
					pane: spawned.pane
				};
			}
		});
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	if (warning) console.error(`first-turn doorbell not confirmed (peer still spawned; nudge it manually): ${warning}`);
	emitService(opts, {
		outcome: res.outcome,
		...serviceFields(res.view)
	});
	if (res.outcome === "starting") nextStep(`another caller is starting it — re-run to resolve: cyberlegion service resolve ${projectRef} ${name}`);
});
const mail = program.command("mail").description("durable inter-agent messaging");
function defineSend(cmd) {
	return withGlobals(cmd).description("send a message to a peer (by handle or id)").requiredOption("--to <peer>", "recipient handle or id").option("--from <id>", "sender id (else this session own identity)").option("--subject <s>", "subject").option("--body <text>", "message body").option("--body-file <path>", "read body from a file, or - for stdin").option("--thread <id>", "thread id").option("--reply-to <msg>", "message id this replies to").option("--no-nudge", "suppress the delivery doorbell (do not wake the recipient's pane)").action(async (opts) => {
		const ctx = ctxOf(opts);
		const fromId = opts.from ?? requireSelf(ctx);
		const body = resolveBody(opts.body, opts.bodyFile);
		const msg = send({ store: ctx.store }, {
			fromId,
			to: opts.to,
			subject: opts.subject,
			body,
			thread: opts.thread,
			replyTo: opts.replyTo
		});
		const wake = await wakeRecipient(ctx.store, () => selectSessionAdapter(ctx.env ?? process.env), realExec, {
			toId: msg.to,
			fromId,
			noNudge: opts.nudge === false
		});
		if (wake.warning) console.error(`delivery doorbell not confirmed (message still delivered): ${wake.warning}`);
		emit(formatOf(opts), {
			toon: toonObject({
				sent: msg.id,
				to: opts.to,
				subject: msg.subject,
				rung: wake.rung
			}),
			json: {
				...msg,
				rung: wake.rung
			}
		});
	});
}
defineSend(mail.command("send"));
/** List a resolved inbox (the caller's own or an --owner mailbox) as TOON with an aggregate;
* `readCmd` is the follow-up read command prefix surfaced as the next step. */
function emitInbox(ctx, opts, meId, readCmd) {
	const items = inbox({ store: ctx.store }, {
		meId,
		unread: opts.unread,
		from: opts.from,
		thread: opts.thread
	});
	const unreadCount = items.filter((i) => !i.read).length;
	emit(formatOf(opts), {
		toon: toonList("messages", items, [
			{
				key: "id",
				get: (m) => m.id
			},
			{
				key: "from",
				get: (m) => m.fromHandle
			},
			{
				key: "subject",
				get: (m) => m.subject ?? ""
			},
			{
				key: "read",
				get: (m) => m.read
			}
		], `${items.length} messages (${unreadCount} unread)`),
		json: items
	});
	const firstUnread = items.find((m) => !m.read);
	if (firstUnread) nextStep(`${readCmd} ${firstUnread.id}`);
}
function runInbox(opts) {
	const ctx = ctxOf(opts);
	touch(ctx);
	emitInbox(ctx, opts, opts.owner ? resolveOwnerMailbox(ctx.store, opts.owner) : requireSelf(ctx), "cyberlegion mail read");
}
withGlobals(mail.command("inbox")).description("list your mail").option("--unread", "only un-acked mail").option("--from <id>", "filter by sender").option("--thread <id>", "filter to messages carrying this thread id").option("--owner <handle>", "target a standing owner's mailbox instead of this session's own").action(runInbox);
withGlobals(mail.command("read")).description("read a message; --ack consumes it in the same step, otherwise it only peeks").argument("<msg-id>", "message id").option("--ack", "acknowledge the message in the same step (idempotent — no error if already acked)").option("--owner <handle>", "read a standing owner's mailbox instead of this session's own").action((msgId, opts) => {
	const ctx = ctxOf(opts);
	const meId = opts.owner ? resolveOwnerMailbox(ctx.store, opts.owner) : requireSelf(ctx);
	if (opts.ack) {
		const { msg, acked } = readAck({ store: ctx.store }, meId, msgId);
		emit(formatOf(opts), {
			toon: toonObject({
				id: msg.id,
				from: msg.fromHandle,
				subject: msg.subject,
				body: msg.body,
				acked
			}),
			json: {
				...msg,
				acked
			}
		});
		return;
	}
	const msg = peek({ store: ctx.store }, meId, msgId);
	if (!msg) fail(`"${msgId}" is not a message in this inbox`);
	emit(formatOf(opts), {
		toon: toonObject({
			id: msg.id,
			from: msg.fromHandle,
			subject: msg.subject,
			body: msg.body
		}),
		json: msg
	});
	nextStep(`cyberlegion mail ack ${msg.id}${opts.owner ? ` --owner ${opts.owner}` : ""}`);
});
withGlobals(mail.command("ack")).description("acknowledge a message (moves it out of the unread set)").argument("<msg-id>", "message id").option("--owner <handle>", "ack a standing owner's mailbox instead of this session's own").action((msgId, opts) => {
	const ctx = ctxOf(opts);
	const meId = opts.owner ? resolveOwnerMailbox(ctx.store, opts.owner) : requireSelf(ctx);
	const msg = ack({ store: ctx.store }, meId, msgId);
	emit(formatOf(opts), {
		toon: toonObject({
			acked: msg.id,
			from: msg.fromHandle,
			subject: msg.subject
		}),
		json: msg
	});
});
withGlobals(mail.command("delete")).description("permanently remove a message from your inbox (unread or already-acked)").argument("<msg-id>", "message id").action((msgId, opts) => {
	const ctx = ctxOf(opts);
	const meId = requireSelf(ctx);
	deleteMessage({ store: ctx.store }, meId, msgId);
	emit(formatOf(opts), {
		toon: toonObject({ deleted: msgId }),
		json: { deleted: msgId }
	});
});
withGlobals(mail.command("await")).description("block until a thread-correlated reply arrives, print it, and ack it").requiredOption("--thread <id>", "thread id to wait on").option("--from <h>", "only match a reply from this sender").option("--timeout <ms>", "give up after this many ms with no match (0 = wait forever); exits non-zero on timeout", (v) => Number.parseInt(v, 10), 6e5).option("--max-wait <s>", "self-cap for one internal poll cycle, in seconds — returns the clean \"waiting\" sentinel at this cap so the caller can re-arm rather than blocking past a harness tool-timeout", (v) => Number.parseInt(v, 10), 240).addHelpText("after", "\nThree outcomes:\n  matched      — exit 0; the message is printed on stdout and acked (moved out of the unread set).\n  waiting      — exit 0; a stderr \"waiting\" line and nothing on stdout — the per-call --max-wait\n                 cap was hit with no match yet; re-run the same command to keep waiting.\n  timed-out    — exit 1; a clear stderr message and nothing on stdout — --timeout elapsed with no match.\n").action(async (opts) => {
	const ctx = ctxOf(opts);
	const meId = requireSelf(ctx);
	const outcome = await awaitReply({ store: ctx.store }, {
		meId,
		thread: opts.thread,
		from: opts.from,
		timeoutMs: opts.timeout,
		maxWaitS: opts.maxWait
	});
	if (outcome.kind === "matched") {
		const msg = outcome.message;
		emit(formatOf(opts), {
			toon: toonObject({
				id: msg.id,
				from: msg.fromHandle,
				subject: msg.subject,
				body: msg.body
			}),
			json: msg
		});
		return;
	}
	if (outcome.kind === "waiting") {
		console.error(`waiting — no reply on thread "${opts.thread}" within --max-wait ${opts.maxWait}s; re-run to keep waiting`);
		return;
	}
	fail(`no reply on thread "${opts.thread}" within ${opts.timeout}ms`);
});
withGlobals(mail.command("watch")).description("stream new matching mail as it arrives — an observer only, it never acks; Ctrl-C to stop").option("--thread <id>", "filter to a thread").option("--from <h>", "filter by sender").action(async (opts) => {
	const ctx = ctxOf(opts);
	const meId = requireSelf(ctx);
	await watchMail({ store: ctx.store }, {
		meId,
		thread: opts.thread,
		from: opts.from
	}, (msg) => {
		emit(formatOf(opts), {
			toon: toonObject({
				id: msg.id,
				from: msg.fromHandle,
				subject: msg.subject,
				body: msg.body
			}),
			json: msg
		});
	});
});
withGlobals(mail.command("hook")).description("emit the harness hook injection payload (raw JSON on stdout, not TOON)").option("--event <event>", "SessionStart | PostToolUse", "SessionStart").action((opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const payload = injectInbox(ctx, opts.event);
	if (payload) console.log(JSON.stringify(payload));
});
const agent = program.command("agent").description("resolve reusable agent definitions");
const INSTRUCTIONS_PREVIEW_LEN = 200;
function truncated(text, full) {
	if (full || text.length <= INSTRUCTIONS_PREVIEW_LEN) return text;
	return `${text.slice(0, INSTRUCTIONS_PREVIEW_LEN)}… (${text.length} chars total, pass --full)`;
}
function agentDefFields(d) {
	return {
		name: d.name,
		description: d.description,
		model: d.model ?? HARNESS_DEFAULT,
		effort: d.effort,
		harness: d.harness ?? HARNESS_DEFAULT,
		warm: d.warm ?? false,
		interactive: d.interactive ?? false,
		path: d.path
	};
}
withGlobals(agent.command("list")).description("list resolvable agent definitions under .agents/agents/").option("--dir <path>", "project dir to search from", process.cwd()).action((opts) => {
	const defs = listAgentDefs({ cwd: opts.dir });
	emit(formatOf(opts), {
		toon: toonList("defs", defs, [
			{
				key: "name",
				get: (d) => d.name
			},
			{
				key: "model",
				get: (d) => d.model ?? "-"
			},
			{
				key: "harness",
				get: (d) => d.harness ?? "-"
			}
		], `${defs.length} agent definitions`),
		json: defs
	});
	if (defs.length === 0) nextStep("add a .md file under .agents/agents/ to define one");
});
withGlobals(agent.command("show")).description("show a resolved agent definition (model/effort/harness/warm/interactive + instructions)").argument("<name>", "agent def name (file stem under .agents/agents/)").option("--dir <path>", "project dir to search from", process.cwd()).option("--full", "show the full instructions body (default: truncated)").action((name, opts) => {
	let def;
	try {
		def = resolveAgentDef({
			name,
			cwd: opts.dir
		});
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject({
			...agentDefFields(def),
			instructions: truncated(def.instructions, opts.full)
		}),
		json: {
			...def,
			instructions: opts.full ? def.instructions : truncated(def.instructions, opts.full)
		}
	});
});
withGlobals(agent.command("resolve")).description("emit the full machine payload for a def — for a routing caller to compose a launch/spawn from").argument("[name]", "agent def name (omit when passing --file)").option("--file <path>", "read an exact def file instead of resolving by name (plugin-scoped escape hatch)").option("--dir <path>", "project dir to search from", process.cwd()).action((name, opts) => {
	let def;
	try {
		def = resolveAgentDef({
			name,
			file: opts.file,
			cwd: opts.dir
		});
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject(agentDefFields(def)),
		json: def
	});
});
withGlobals(agent.command("path")).description("print the resolved def file path").argument("<name>", "agent def name (file stem under .agents/agents/)").option("--dir <path>", "project dir to search from", process.cwd()).action((name, opts) => {
	let def;
	try {
		def = resolveAgentDef({
			name,
			cwd: opts.dir
		});
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonObject({ path: def.path }),
		json: { path: def.path }
	});
});
const mux = program.command("mux").description("the unit-agnostic pane layer — multiplexer detection and diagnostics");
withGlobals(mux.command("doctor")).description("probe harness, multiplexer (ancestry-discovered), hub root, and self-id").action((opts) => {
	const ctx = ctxOf(opts);
	const harness = detectHarness(void 0, ctx) ?? "unknown";
	const probe = probeMultiplexer(ctx.exec ?? realExec, normalizeMuxEnv(ctx.env ?? process.env));
	const selfId = resolveSelfId(ctx) ?? "-";
	emit(formatOf(opts), {
		toon: toonObject({
			harness,
			mux: probe.mux,
			pane: probe.pane,
			via: probe.via,
			hubRoot: ctx.store.root,
			selfId
		}),
		json: {
			harness,
			mux: probe.mux,
			pane: probe.pane,
			via: probe.via,
			hubRoot: ctx.store.root,
			selfId
		}
	});
	if (probe.mux !== "none") nextStep(`export CYBER_MUX=${probe.mux}${probe.pane ? ` CYBER_MUX_PANE=${probe.pane}` : ""} — pin the fast-path, skip ancestry discovery on later calls`);
});
withGlobals(mux.command("mode")).description("report the detected session-backend mode").action((opts) => {
	const ctx = ctxOf(opts);
	let mode = "none";
	try {
		mode = selectSessionAdapter(ctx.env ?? process.env).name;
	} catch {}
	emit(formatOf(opts), {
		toon: toonObject({ mode }),
		json: { mode }
	});
});
withGlobals(program.command("attach")).description("bind this pane as the hub's main pane (the owner's live presence); --show reads it, --clear unbinds").option("--clear", "unbind the main pane (a no-op when nothing is bound)").option("--show", "print the bound main pane instead of binding").action((opts) => {
	const ctx = ctxOf(opts);
	if (opts.show) {
		const pane = ctx.store.getMainPane();
		emit(formatOf(opts), {
			toon: toonObject({ mainPane: pane ?? "none" }),
			json: { mainPane: pane ?? null }
		});
		return;
	}
	if (opts.clear) {
		ctx.store.setMainPane(null);
		emit(formatOf(opts), {
			toon: toonObject({ mainPane: "none" }),
			json: { mainPane: null }
		});
		return;
	}
	const cur = currentPane(normalizeMuxEnv(ctx.env ?? process.env));
	if (!cur) fail("no multiplexer pane to bind — run this from inside a tmux or herdr pane");
	ctx.store.setMainPane(cur.pane);
	emit(formatOf(opts), {
		toon: toonObject({ mainPane: cur.pane }),
		json: { mainPane: cur.pane }
	});
});
withGlobals(program.command("admin").description("hub-state maintenance").command("migrate")).description("merge one hub root state into another (e.g. an old project-local root into the global hub)").requiredOption("--from <path>", "source hub root").requiredOption("--to <path>", "destination hub root").action((opts) => {
	const res = migrateStore(new FileStore(resolve(opts.from)), new FileStore(resolve(opts.to)));
	emit(formatOf(opts), {
		toon: toonObject({
			agents: res.agents,
			messages: res.messages,
			briefs: res.briefs
		}),
		json: res
	});
});
withGlobals(program.command("init")).description("resolve this session harness, register the Legion surfacing hook, and advise owner binding").option("--agent <h>", "claude | cursor | codex (else auto-detected)").option("--dir <path>", "project dir to write config into", process.cwd()).option("--pin <version>", "version to pin the registered npx hook command to (e.g. the bundled plugin version)").action((opts) => {
	const ctx = ctxOf(opts);
	let harness;
	try {
		const detected = detectHarness(opts.agent, ctx);
		if (!detected) fail("could not detect harness — pass --agent claude|cursor|codex");
		harness = detected;
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	let results;
	try {
		results = install(harness, opts.dir, opts.pin);
	} catch (err) {
		fail(err instanceof Error ? err.message : String(err));
	}
	emit(formatOf(opts), {
		toon: toonList("hooks", results, [
			{
				key: "event",
				get: (r) => r.event
			},
			{
				key: "status",
				get: (r) => r.status
			},
			{
				key: "file",
				get: (r) => r.file
			}
		], `harness ${harness}, ${results.length} hooks`),
		json: {
			harness,
			hooks: results
		}
	});
	if (!listAgents(ctx.store).some((a) => a.kind === "standing")) {
		nextStep("cyberlegion unit register --standing --handle <name> to mint the durable owner inbox");
		nextStep("cyberlegion attach to bind this pane as the owner live presence");
	}
});
defineSpawn(program.command("spawn"));
defineSend(program.command("send"));
withGlobals(program.command("inbox")).description("list your mail (alias of `mail inbox`)").option("--unread", "only un-acked mail").option("--from <id>", "filter by sender").option("--thread <id>", "filter to messages carrying this thread id").action(runInbox);
withGlobals(program.command("who")).description("list the addressable units (alias of `unit who`)").option("--all", "include exited units").option("--reconcile", "live-probe the current mux: cull dead-pane records and adopt unbound harness-bearing panes before listing").action(runWho);
withGlobals(program).action((opts) => {
	const ctx = ctxOf(opts);
	touch(ctx);
	const id = resolveSelfId(ctx);
	const rec = id ? loadAgent(ctx.store, id) : void 0;
	const unread = id ? inbox({ store: ctx.store }, {
		meId: id,
		unread: true
	}).length : 0;
	const units = listAgents(ctx.store).filter((a) => a.status !== "exited").length;
	emit(formatOf(opts), {
		toon: toonObject({
			self: rec?.handle ?? id ?? "-",
			harness: rec?.harness ?? "-",
			unread,
			units
		}),
		json: {
			self: rec ? {
				id: rec.id,
				handle: rec.handle,
				harness: rec.harness
			} : null,
			unread,
			units
		}
	});
	if (!id) nextStep("cyberlegion unit register to join");
	else if (unread > 0) nextStep("cyberlegion mail inbox --unread");
});
/**
* Run the CLI. Exported rather than executed at module scope so the command bodies are reachable
* from a test: with a bare `program.parseAsync(process.argv)` here, importing this module ran the
* whole CLI, so every `.action()` body — and every option wire inside it — was unreachable, and a
* flag that stopped being forwarded changed real behavior with the suite green.
*
* `bin/cyberlegion.mjs` calls this; nothing else should.
*/
async function runCli(argv = process.argv) {
	try {
		await program.parseAsync(argv);
	} catch (err) {
		console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
		process.exit(1);
	}
}
//#endregion
export { runCli };
