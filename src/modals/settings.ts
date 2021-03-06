import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { IMarker, ObsidianLeaflet } from "../@types";
import {
    findIconDefinition,
    getIcon,
    getMarkerIcon,
    icon,
    IconName,
    iconNames,
    removeValidationError,
    setValidationError,
} from "../utils";
import { IconSuggestionModal } from "./icon";

export class CreateMarkerModal extends Modal {
    marker: IMarker;
    tempMarker: IMarker;
    plugin: ObsidianLeaflet;
    canvas: HTMLCanvasElement;
    constructor(app: App, plugin: ObsidianLeaflet, marker: IMarker) {
        super(app);
        this.marker = marker;
        this.plugin = plugin;

        this.tempMarker = { ...this.marker };
    }
    get data() {
        return this.plugin.AppData;
    }

    async display(focusEl?: string): Promise<void> {
        let containerEl = this.contentEl;
        containerEl.empty();

        let createNewMarker = containerEl.createDiv();
        createNewMarker.addClass("additional-markers-container");
        //new Setting(createNewMarker).setHeading().setName("Create New Marker");

        let iconDisplayAndSettings = createNewMarker.createDiv();
        iconDisplayAndSettings.addClass("marker-creation-modal");
        let iconSettings = iconDisplayAndSettings.createDiv();
        let iconDisplay = iconDisplayAndSettings.createDiv();

        let typeTextInput: TextComponent;
        let markerName = new Setting(
            this.tempMarker.isImage ? createNewMarker : iconSettings
        )
            .setName("Marker Name")
            .addText((text) => {
                typeTextInput = text
                    .setPlaceholder("Marker Name")
                    .setValue(this.tempMarker.type);
                typeTextInput.onChange((new_value) => {
                    if (
                        this.data.markerIcons.find(
                            (marker) => marker.type == new_value
                        ) &&
                        this.tempMarker.type != this.marker.type
                    ) {
                        setValidationError(
                            typeTextInput,
                            "Marker name already exists."
                        );
                        return;
                    }

                    if (new_value.length == 0) {
                        setValidationError(
                            typeTextInput,
                            "Marker name cannot be empty."
                        );
                        return;
                    }

                    removeValidationError(typeTextInput);

                    this.tempMarker.type = new_value;
                });
            });

        let iconTextInput: TextComponent;
        let iconName = new Setting(
            this.tempMarker.isImage ? createNewMarker : iconSettings
        )
            .setName("Marker Icon")
            .setDesc("Font Awesome icon name (e.g. map-marker).")
            .addText((text) => {
                text.setPlaceholder("Icon Name").setValue(
                    !this.tempMarker.isImage ? this.tempMarker.iconName : ""
                );

                const validate = async () => {
                    const new_value = text.inputEl.value;

                    if (!new_value.length) {
                        setValidationError(
                            text,
                            "A default marker must be defined."
                        );
                        return;
                    }
                    if (
                        !findIconDefinition({
                            iconName: new_value as IconName,
                            prefix: "fas"
                        })
                    ) {
                        setValidationError(
                            text,
                            "The selected icon does not exist in Font Awesome Free."
                        );
                        return;
                    }

                    removeValidationError(text);
                    this.tempMarker.iconName = new_value;
                    this.tempMarker.isImage = false;
                    delete this.tempMarker.imageUrl;

                    await this.plugin.saveSettings();

                    this.display();
                };

                const modal = new IconSuggestionModal(
                    this.app,
                    text,
                    iconNames
                );

                modal.onClose = validate;

                text.inputEl.onblur = validate;

                iconTextInput = text;
            });

        const input = createEl("input", {
            attr: {
                type: "file",
                name: "image",
                accept: "image/*"
            }
        });
        new Setting(this.tempMarker.isImage ? createNewMarker : iconSettings)
            .setName("Use Image for Icon")
            .addButton((b) => {
                b.setButtonText("Upload Image").setTooltip("Upload Image");
                b.buttonEl.addClass("leaflet-file-upload");
                b.buttonEl.appendChild(input);
                b.onClick(() => input.click());
            });

        /** Image Uploader */
        input.onchange = async () => {
            const { files } = input;

            if (!files.length) return;

            const image = files[0];
            const reader = new FileReader();
            reader.onloadend = (evt) => {
                var image = new Image();
                image.onload = () => {
                    // Resize the image
                    const canvas = (this.canvas = createEl("canvas")),
                        max_size = 24;
                    let width = image.width,
                        height = image.height;
                    if (width > height) {
                        if (width > max_size) {
                            height *= max_size / width;
                            width = max_size;
                        }
                    } else {
                        if (height > max_size) {
                            width *= max_size / height;
                            height = max_size;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    canvas
                        .getContext("2d")
                        .drawImage(image, 0, 0, width, height);

                    this.tempMarker.isImage = true;
                    this.tempMarker.imageUrl = canvas.toDataURL("image/png");

                    this.display();
                };
                image.src = evt.target.result.toString();
            };
            reader.readAsDataURL(image);

            input.value = null;
        };

        if (!this.tempMarker.isImage) {
            if (this.tempMarker.iconName) {
                
                const params =
                    this.tempMarker.layer && !this.data.defaultMarker.isImage
                        ? {
                              transform: this.tempMarker.transform,
                              mask: getIcon(this.data.defaultMarker.iconName),
                              classes: ["full-width-height"]
                          }
                        : { classes: ["full-width-height"] };
                let node = getMarkerIcon(this.tempMarker, params)
                    .node as HTMLElement;
                node.style.color = this.tempMarker.color
                    ? this.tempMarker.color
                    : this.data.defaultMarker.color;
                //let marker = iconDisplay;
                let iconDisplayHeight =
                    markerName.settingEl.getBoundingClientRect().height +
                    iconName.settingEl.getBoundingClientRect().height;
                iconDisplay.setAttribute(
                    "style",
                    `height: ${iconDisplayHeight}px; padding: 1rem; position: relative;`
                );
                iconDisplay.appendChild(node);

                if (this.tempMarker.layer) {
                    let iconOverlay = icon(getIcon(this.tempMarker.iconName), {
                        transform: this.tempMarker.transform
                    }).node[0].children[0] as SVGGraphicsElement;
                    let iconPath = iconOverlay.getElementsByTagName("path")[0];

                    let fill = this.getFillColor(this.modalEl);

                    iconPath.setAttribute("fill", fill[0]);
                    iconPath.setAttribute("fill-opacity", `1`);
                    iconPath.setAttribute("stroke-width", "1px");
                    iconPath.setAttribute("stroke", "black");
                    iconPath.setAttribute("stroke-dasharray", "50,50");

                    let transformSource = iconOverlay
                        .children[0] as SVGGraphicsElement;
                    let svgElement = iconDisplay.getElementsByTagName("svg")[0],
                        xPath = document.createElementNS(
                            "http://www.w3.org/2000/svg",
                            "path"
                        ),
                        yPath = document.createElementNS(
                            "http://www.w3.org/2000/svg",
                            "path"
                        );

                    xPath.setAttribute("stroke", "red");
                    xPath.setAttribute("stroke-width", "0");
                    xPath.setAttribute("d", "M192,0 L192,512");

                    yPath.setAttribute("stroke", "red");
                    yPath.setAttribute("stroke-width", "0");
                    yPath.setAttribute("d", "M0,256 L384,256");

                    svgElement.appendChild(xPath);
                    svgElement.appendChild(yPath);
                    let units = {
                        width: 512 / 16,
                        height: 512 / 16
                    };

                    svgElement.appendChild(iconOverlay);

                    /** Fix x/y positioning due to different icon sizes */
                    iconOverlay.transform.baseVal
                        .getItem(0)
                        .setTranslate(192, 256);

                    let clickedOn: boolean = false,
                        offset: { x: number; y: number } = { x: 0, y: 0 },
                        transform: SVGTransform;

                    this.plugin.registerDomEvent(
                        iconOverlay as unknown as HTMLElement,
                        "mousedown",
                        (evt) => {
                            let CTM = svgElement.getScreenCTM();
                            offset = {
                                x: (evt.clientX - CTM.e) / CTM.a,
                                y: (evt.clientY - CTM.f) / CTM.d
                            };

                            let transforms = transformSource.transform.baseVal;
                            if (
                                transforms.numberOfItems === 0 ||
                                transforms.getItem(0).type !=
                                    SVGTransform.SVG_TRANSFORM_TRANSLATE
                            ) {
                                let translate = svgElement.createSVGTransform();
                                translate.setTranslate(0, 0);
                                // Add the translation to the front of the transforms list
                                transformSource.transform.baseVal.insertItemBefore(
                                    translate,
                                    0
                                );
                            }

                            transform = transforms.getItem(0);
                            offset.x -= transform.matrix.e;
                            offset.y -= transform.matrix.f;

                            clickedOn = true;
                        }
                    );
                    this.plugin.registerDomEvent(
                        this.containerEl,
                        "mouseup",
                        (evt) => {
                            offset = { x: 0, y: 0 };
                            xPath.setAttribute("stroke-width", "0");
                            yPath.setAttribute("stroke-width", "0");
                            clickedOn = false;
                        }
                    );
                    this.plugin.registerDomEvent(
                        iconOverlay as unknown as HTMLElement,
                        "mousemove",
                        (evt) => {
                            if (clickedOn) {
                                evt.preventDefault();
                                let CTM = svgElement.getScreenCTM();
                                let coords = {
                                    x: (evt.clientX - CTM.e) / CTM.a,
                                    y: (evt.clientY - CTM.f) / CTM.d
                                };

                                //snap to x/y
                                let x = coords.x - offset.x,
                                    y = coords.y - offset.y;
                                if (Math.abs(x) <= 32 && evt.shiftKey) {
                                    xPath.setAttribute("stroke-width", "8");
                                    x = 0;
                                } else {
                                    xPath.setAttribute("stroke-width", "0");
                                }
                                if (Math.abs(y) <= 32 && evt.shiftKey) {
                                    yPath.setAttribute("stroke-width", "8");
                                    y = 0;
                                } else {
                                    yPath.setAttribute("stroke-width", "0");
                                }

                                transform.setTranslate(x, y);

                                this.tempMarker.transform.x =
                                    transform.matrix.e / units.width;
                                this.tempMarker.transform.y =
                                    transform.matrix.f / units.height;
                            }
                        }
                    );
                }
            }

            new Setting(createNewMarker)
                .setName("Layer Icon")
                .setDesc("The icon will be layered on the base icon, if any.")
                .addToggle((toggle) => {
                    toggle.setValue(this.tempMarker.layer).onChange((v) => {
                        this.tempMarker.layer = v;
                        this.display();
                    });
                    if (this.data.defaultMarker.iconName == null) {
                        toggle
                            .setDisabled(true)
                            .setTooltip(
                                "Add a base marker to layer this icon."
                            );
                    }
                });
            let colorInput = new Setting(createNewMarker)
                .setName("Icon Color")
                .setDesc("Override default icon color.");
            let colorInputNode = colorInput.controlEl.createEl("input", {
                attr: {
                    type: "color",
                    value: this.tempMarker.color
                }
            });
            colorInputNode.oninput = (evt) => {
                this.tempMarker.color = (evt.target as HTMLInputElement).value;

                iconDisplay.children[0].setAttribute(
                    "style",
                    `color: ${this.tempMarker.color}`
                );
            };
            colorInputNode.onchange = async (evt) => {
                this.tempMarker.color = (evt.target as HTMLInputElement).value;

                this.display();
            };
        }

        let add = new Setting(createNewMarker);

        if (this.tempMarker.isImage) {
            if (!this.canvas) {
                this.canvas = createEl("canvas");
                let image = new Image();
                image.src = this.tempMarker.imageUrl;
                this.canvas.width = image.width;
                this.canvas.height = image.height;
                this.canvas
                    .getContext("2d")
                    .drawImage(image, 0, 0, image.width, image.height);
            }
            add.infoEl.appendChild(this.canvas);
        }

        add.addButton((button: ButtonComponent): ButtonComponent => {
            let b = button.setTooltip("Save").onClick(async () => {
                // Force refresh
                let error = false;
                if (
                    this.data.markerIcons.find(
                        (marker) => marker.type == this.tempMarker.type
                    ) &&
                    this.tempMarker.type != this.marker.type
                ) {
                    setValidationError(
                        typeTextInput,
                        "Marker type already exists."
                    );
                    error = true;
                }

                if (this.tempMarker.type.length == 0) {
                    setValidationError(
                        typeTextInput,
                        "Marker name cannot be empty."
                    );
                    error = true;
                }
                if (
                    !findIconDefinition({
                        iconName: iconTextInput.inputEl.value as IconName,
                        prefix: "fas"
                    }) &&
                    !this.tempMarker.isImage
                ) {
                    setValidationError(iconTextInput, "Invalid icon name.");
                    error = true;
                }

                if (!this.tempMarker.iconName && !this.tempMarker.isImage) {
                    setValidationError(iconTextInput, "Icon cannot be empty.");
                    error = true;
                }

                if (error) {
                    return;
                }

                this.marker.type = this.tempMarker.type;
                this.marker.iconName = this.tempMarker.iconName;
                this.marker.color = this.tempMarker.color;
                this.marker.layer = this.tempMarker.layer;
                this.marker.transform = this.tempMarker.transform;
                this.marker.isImage = this.tempMarker.isImage;
                this.marker.imageUrl = this.tempMarker.imageUrl;

                this.close();
            });
            b.buttonEl.appendChild(
                icon(
                    findIconDefinition({
                        iconName: "save",
                        prefix: "fas"
                    })
                ).node[0]
            );
            return b;
        });
        add.addExtraButton((b) => {
            b.setIcon("cross")
                .setTooltip("Cancel")
                .onClick(() => {
                    this.close();
                });
        });

        if (focusEl) {
            (
                this.contentEl.querySelector(`#${focusEl}`) as HTMLInputElement
            ).focus();
        }
    }

    onOpen() {
        this.display();
    }

    getFillColor(el: HTMLElement): string[] {
        let fill = getComputedStyle(el).getPropertyValue("background-color");

        if (fill.includes("rgb")) {
            // Choose correct separator
            let sep = fill.indexOf(",") > -1 ? "," : " ";
            // Turn "rgb(r,g,b)" into [r,g,b]
            let rgbArr = fill.split("(")[1].split(")")[0].split(sep);
            let r = (+rgbArr[0]).toString(16),
                g = (+rgbArr[1]).toString(16),
                b = (+rgbArr[2]).toString(16);

            if (r.length == 1) r = "0" + r;
            if (g.length == 1) g = "0" + g;
            if (b.length == 1) b = "0" + b;

            return ["#" + r + g + b, rgbArr[3] ? `${+rgbArr[3]}` : "1"];
        }
        if (fill.includes("#")) {
            return [fill, "1"];
        }
    }
}
