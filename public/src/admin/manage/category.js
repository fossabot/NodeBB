define('admin/manage/category', [
	'uploader',
	'iconSelect',
	'admin/modules/colorpicker',
	'categorySelector',
	'benchpress',
	'api',
], function (uploader, iconSelect, colorpicker, categorySelector, Benchpress, api) {
	var	Category = {};
	var updateHash = {};

	Category.init = function () {
		$('#category-settings select').each(function () {
			var $this = $(this);
			$this.val($this.attr('data-value'));
		});

		$('#category-selector').on('change', function () {
			ajaxify.go('admin/manage/categories/' + $(this).val() + window.location.hash);
		});

		function enableColorPicker(idx, inputEl) {
			var $inputEl = $(inputEl);
			var previewEl = $inputEl.parents('[data-cid]').find('.category-preview');

			colorpicker.enable($inputEl, function (hex) {
				if ($inputEl.attr('data-name') === 'bgColor') {
					previewEl.css('background-color', hex);
				} else if ($inputEl.attr('data-name') === 'color') {
					previewEl.css('color', hex);
				}

				modified($inputEl[0]);
			});
		}

		handleTags();

		$('#category-settings input, #category-settings select').on('change', function (ev) {
			modified(ev.target);
		});

		$('[data-name="imageClass"]').on('change', function () {
			$('.category-preview').css('background-size', $(this).val());
		});

		$('[data-name="bgColor"], [data-name="color"]').each(enableColorPicker);

		$('#save').on('click', function () {
			var cid = ajaxify.data.category.cid;
			api.put('/categories/' + cid, updateHash, (res) => {
				app.flags._unsaved = false;
				app.alert({
					title: 'Updated Categories',
					message: 'Category "' + res.name + '" was successfully updated.',
					type: 'success',
					timeout: 2000,
				});
				updateHash = {};
			}, (err) => {
				app.alertError(err.status.message);
			});

			return false;
		});

		$('.purge').on('click', function (e) {
			e.preventDefault();

			Benchpress.parse('admin/partials/categories/purge', {
				name: ajaxify.data.category.name,
				topic_count: ajaxify.data.category.topic_count,
			}, function (html) {
				var modal = bootbox.dialog({
					title: '[[admin/manage/categories:purge]]',
					message: html,
					size: 'large',
					buttons: {
						save: {
							label: '[[modules:bootbox.confirm]]',
							className: 'btn-primary',
							callback: function () {
								modal.find('.modal-footer button').prop('disabled', true);

								var intervalId = setInterval(function () {
									socket.emit('categories.getTopicCount', ajaxify.data.category.cid, function (err, count) {
										if (err) {
											return app.alertError(err);
										}

										var percent = 0;
										if (ajaxify.data.category.topic_count > 0) {
											percent = Math.max(0, (1 - (count / ajaxify.data.category.topic_count))) * 100;
										}

										modal.find('.progress-bar').css({ width: percent + '%' });
									});
								}, 1000);

								api.del('/categories/' + ajaxify.data.category.cid, undefined, () => {
									if (intervalId) {
										clearInterval(intervalId);
									}
									modal.modal('hide');
									app.alertSuccess('[[admin/manage/categories:alert.purge-success]]');
									ajaxify.go('admin/manage/categories');
								}, (err) => {
									app.alertError(err.status.message);
								});

								return false;
							},
						},
					},
				});
			});
		});

		$('.copy-settings').on('click', function () {
			socket.emit('categories.getSelectCategories', {}, function (err, allCategories) {
				if (err) {
					return app.alertError(err.message);
				}

				Benchpress.parse('admin/partials/categories/copy-settings', {
					categories: allCategories,
				}, function (html) {
					var selectedCid;
					var modal = bootbox.dialog({
						title: '[[modules:composer.select-category]]',
						message: html,
						buttons: {
							save: {
								label: '[[modules:bootbox.confirm]]',
								className: 'btn-primary',
								callback: function () {
									if (!selectedCid || parseInt(selectedCid, 10) === parseInt(ajaxify.data.category.cid, 10)) {
										return;
									}

									socket.emit('admin.categories.copySettingsFrom', {
										fromCid: selectedCid,
										toCid: ajaxify.data.category.cid,
										copyParent: modal.find('#copyParent').prop('checked'),
									}, function (err) {
										if (err) {
											return app.alertError(err.message);
										}

										modal.modal('hide');
										app.alertSuccess('[[admin/manage/categories:alert.copy-success]]');
										ajaxify.refresh();
									});
									return false;
								},
							},
						},
					});
					modal.find('.modal-footer button').prop('disabled', true);
					categorySelector.init(modal.find('[component="category-selector"]'), function (selectedCategory) {
						selectedCid = selectedCategory && selectedCategory.cid;
						if (selectedCid) {
							modal.find('.modal-footer button').prop('disabled', false);
						}
					});
				});
				return false;
			});
		});

		$('.upload-button').on('click', function () {
			var inputEl = $(this);
			var cid = inputEl.attr('data-cid');

			uploader.show({
				title: '[[admin/manage/categories:alert.upload-image]]',
				route: config.relative_path + '/api/admin/category/uploadpicture',
				params: { cid: cid },
			}, function (imageUrlOnServer) {
				$('#category-image').val(imageUrlOnServer);
				var previewBox = inputEl.parent().parent().siblings('.category-preview');
				previewBox.css('background', 'url(' + imageUrlOnServer + '?' + new Date().getTime() + ')');

				modified($('#category-image'));
			});
		});

		$('#category-image').on('change', function () {
			$('.category-preview').css('background-image', $(this).val() ? ('url("' + $(this).val() + '")') : '');
			modified($('#category-image'));
		});

		$('.delete-image').on('click', function (e) {
			e.preventDefault();

			var inputEl = $('#category-image');
			var previewBox = $('.category-preview');

			inputEl.val('');
			previewBox.css('background-image', '');
			modified(inputEl[0]);
			$(this).parent().addClass('hide').hide();
		});

		$('.category-preview').on('click', function () {
			iconSelect.init($(this).find('i'), modified);
		});

		$('[type="checkbox"]').on('change', function () {
			modified($(this));
		});

		$('button[data-action="setParent"], button[data-action="changeParent"]').on('click', Category.launchParentSelector);
		$('button[data-action="removeParent"]').on('click', function () {
			api.put('/categories/' + ajaxify.data.category.cid, {
				parentCid: 0,
			}, () => {
				$('button[data-action="removeParent"]').parent().addClass('hide');
				$('button[data-action="changeParent"]').parent().addClass('hide');
				$('button[data-action="setParent"]').removeClass('hide');
			}, (err) => {
				app.alertError(err.message);
			});
		});
		$('button[data-action="toggle"]').on('click', function () {
			var $this = $(this);
			var disabled = $this.attr('data-disabled') === '1';
			api.put('/categories/' + ajaxify.data.category.cid, {
				disabled: disabled ? 0 : 1,
			}, () => {
				$this.translateText(!disabled ? '[[admin/manage/categories:enable]]' : '[[admin/manage/categories:disable]]');
				$this.toggleClass('btn-primary', !disabled).toggleClass('btn-danger', disabled);
				$this.attr('data-disabled', disabled ? 0 : 1);
			}, (err) => {
				app.alertError(err.message);
			});
		});
	};

	function modified(el) {
		var value;
		if ($(el).is(':checkbox')) {
			value = $(el).is(':checked') ? 1 : 0;
		} else {
			value = $(el).val();
		}

		updateHash[$(el).attr('data-name')] = value;

		app.flags = app.flags || {};
		app.flags._unsaved = true;
	}

	function handleTags() {
		var tagEl = $('#tag-whitelist');
		tagEl.tagsinput({
			confirmKeys: [13, 44],
			trimValue: true,
		});

		ajaxify.data.category.tagWhitelist.forEach(function (tag) {
			tagEl.tagsinput('add', tag);
		});

		tagEl.on('itemAdded itemRemoved', function () {
			modified(tagEl);
		});
	}

	Category.launchParentSelector = function () {
		socket.emit('categories.getSelectCategories', {}, function (err, allCategories) {
			if (err) {
				return app.alertError(err.message);
			}
			var parents = [parseInt(ajaxify.data.category.cid, 10)];
			var categories = allCategories.filter(function (category) {
				var isChild = parents.includes(parseInt(category.parentCid, 10));
				if (isChild) {
					parents.push(parseInt(category.cid, 10));
				}
				return category && !category.disabled && parseInt(category.cid, 10) !== parseInt(ajaxify.data.category.cid, 10) && !isChild;
			});

			categorySelector.modal(categories, function (parentCid) {
				api.put('/categories/' + ajaxify.data.category.cid, {
					parentCid: parentCid,
				}, () => {
					var parent = allCategories.filter(function (category) {
						return category && parseInt(category.cid, 10) === parseInt(parentCid, 10);
					});
					parent = parent[0];

					$('button[data-action="removeParent"]').parent().removeClass('hide');
					$('button[data-action="setParent"]').addClass('hide');
					var buttonHtml = '<i class="fa ' + parent.icon + '"></i> ' + parent.name;
					$('button[data-action="changeParent"]').html(buttonHtml).parent().removeClass('hide');
				}, (err) => {
					app.alertError(err.message);
				});
			});
		});
	};

	return Category;
});
